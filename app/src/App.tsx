import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { lazy, Suspense } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { CaretRight } from '@phosphor-icons/react';
import { BottomSheet } from './components/BottomSheet';
import { Toast } from './components/Toast';
import { AlertThresholdSettings } from './components/AlertThresholdSettings';
import { clampAlertThreshold } from './domain/alertThresholds';
import { previousPanel, type Panel } from './domain/navigation';
import { roundUsagePercent, type BudgetKey } from './domain/budget';
import { applyPayment, cancelPayment, createEmptyLedger, findSuspectedDuplicates, getHistoryEntries, removeLedgerEntry, updateLedgerEntry, getSummary, importCardTransactions, isEntryInPolicyPeriod, reclassifyUndecided, saveAsUndecided, type ImportResult, type Ledger, type LedgerEntry } from './domain/ledger';
import { parseShinhanCardExport, type ImportedCardTransaction } from './domain/shinhanImport';
import { filterTransactionsForConfiguredCard } from './domain/cardImportSafety';
import {
  confirmPolicyForPeriod,
  emptyPolicy,
  getEffectivePolicy,
  getCategoryLabel,
  getCategoryLimit,
  getAlertTargets,
  getNextPolicyPeriodKey,
  getPolicyLimit,
  parsePolicyText,
  POLICY_ITEMS,
  validatePolicyAgainstProfile,
  type PolicyItem,
  type SupportProfileId,
  type SupportPolicy,
} from './domain/policy';
import { type PaymentClassification } from './domain/sms';
import { classifyWithMerchantRules, createMerchantRule, getMerchantAlias, type MerchantMatchMode, type MerchantRule } from './domain/merchantRules';
import { SmsBridge, type NativeApproval } from './native/smsBridge';
import { PolicyOcr } from './native/policyOcr';
import { NotificationBridge } from './native/notificationBridge';
import { WidgetBridge } from './native/widgetBridge';
import type { BackupPayload } from './domain/backup';
import { createEmptyAppState, initializeAppState, loadLegacyAppState, persistAppState } from './native/appStateStore';
import { AppHealth } from './native/appHealth';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { PaymentHistory } from './components/PaymentHistory';
import { UndecidedPanel } from './components/UndecidedPanel';
import { SmsDiagnostics } from './components/SmsDiagnostics';
import type { StoredEvidence } from './native/evidenceVault';
import './App.css';

const EvidenceExport = lazy(() => import('./components/EvidenceExport').then((module) => ({ default: module.EvidenceExport })));
const DataManagementPanel = lazy(() => import('./components/DataManagementPanel').then((module) => ({ default: module.DataManagementPanel })));
const TransactionImport = lazy(() => import('./components/TransactionImport').then((module) => ({ default: module.TransactionImport })));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow').then((module) => ({ default: module.OnboardingFlow })));
const LoadingPanel = () => <p className="panel-loading" role="status">화면을 준비하고 있습니다…</p>;

type ManualClassificationChoice = 'auto' | 'undecided' | PolicyItem;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const manualDateTimeValue = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const categoryNames: Record<string, string> = { lodging: '주거비', food: '식비', education: '교육비', transport: '교통비', studyCafe: '스터디카페', generalCafe: '카페', readingRoom: '독서실' };
const RECOVERY_DISMISSED_EVENT_KEY = 'shinhanhae-force-stop-recovery-dismissed-v1';

function classificationText(result: PaymentClassification) {
  if (result.status === 'excluded') return '제외 대상으로 분류';
  if (result.status === 'undecided') return '미정 — 직접 분류가 필요';
  return `${result.bucket === 'resident' ? '정주비' : '학습공간비'} · ${categoryNames[result.category]}`;
}
function Table({ rows }: { rows: Array<[string, number, number]> }) {
  return <div className="table"><div><span>항목</span><span>계획</span><span>사용</span><span>잔액</span></div>{rows.map(([name, plan, used]) => <div key={name}><strong>{name}</strong><span>{won(plan)}</span><span>{won(used)}</span><span>{won(plan - used)}</span></div>)}</div>;
}
function App() {
  const now = useMemo(() => new Date(), []);
  const nativePlatform = Capacitor.isNativePlatform();
  const initialState = useMemo(() => nativePlatform ? createEmptyAppState() : loadLegacyAppState(window.localStorage, now), [nativePlatform, now]);
  const [panel, setPanel] = useState<Panel>(null);
  const [merchantRules, setMerchantRules] = useState<MerchantRule[]>(initialState.merchantRules);
  const merchantRulesRef = useRef(merchantRules);
  const processingApprovalsRef = useRef(false);
  const [ruleMerchant, setRuleMerchant] = useState('');
  const [ruleItemKey, setRuleItemKey] = useState<PolicyItem>('food');
  const [ruleMatchMode, setRuleMatchMode] = useState<MerchantMatchMode>('contains');
  const [ruleAlias, setRuleAlias] = useState('');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [card, setCard] = useState('');
  const [showCard, setShowCard] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [manualPayment, setManualPayment] = useState({ occurredAt: manualDateTimeValue(), merchant: '', amount: '' });
  const [manualClassification, setManualClassification] = useState<ManualClassificationChoice>('auto');
  const [ledger, setLedger] = useState<Ledger>(initialState.ledger);
  const ledgerRef = useRef(ledger);
  const [importTransactions, setImportTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [undoImportLedger, setUndoImportLedger] = useState<Ledger | null>(null);
  const [importSafety, setImportSafety] = useState<ReturnType<typeof filterTransactionsForConfiguredCard> | null>(null);
  const [policyBook, setPolicyBook] = useState(initialState.policyBook);
  const [storageReady, setStorageReady] = useState(!nativePlatform);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [forceStopRecovery, setForceStopRecovery] = useState(false);
  const [forceStopRecoveryEventId, setForceStopRecoveryEventId] = useState('');
  const [paymentAlertsEnabled, setPaymentAlertsEnabled] = useState(false);
  const [budgetAlertsEnabled, setBudgetAlertsEnabled] = useState(false);
  const activePolicy = getEffectivePolicy(policyBook, now);
  const policy = activePolicy.policy;
  const [policyText, setPolicyText] = useState('');
  const [policyDraft, setPolicyDraft] = useState<SupportPolicy | null>(null);
  const [policyDraftFocusToken, setPolicyDraftFocusToken] = useState(0);
  const [cancellationTarget, setCancellationTarget] = useState<LedgerEntry | null>(null);
  const [editTarget, setEditTarget] = useState<LedgerEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LedgerEntry | null>(null);
  const [detailTargetId, setDetailTargetId] = useState<string | null>(null);
  const [importAfterOnboarding, setImportAfterOnboarding] = useState(false);
  const [initialImportRoute, setInitialImportRoute] = useState(false);
  const leaveImport = () => { setInitialImportRoute(false); setPanel(null); };
  const close = () => { if (panel === 'import') { leaveImport(); return; } setPanel(null); };
  const show = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };
  const refreshNotificationStates = useCallback(async () => {
    if (!nativePlatform) return;
    const [payment, budget] = await Promise.all([
      SmsBridge.getNotificationAccessStatus().catch(() => ({ granted: false })),
      NotificationBridge.getPermissionStatus().catch(() => ({ granted: false })),
    ]);
    setPaymentAlertsEnabled(payment.granted);
    setBudgetAlertsEnabled(budget.granted);
  }, [nativePlatform]);
  useEffect(() => { ledgerRef.current = ledger; }, [ledger]);
  useEffect(() => {
    let active = true;
    void initializeAppState(window.localStorage, now).then(({ state, migrated }) => {
      if (!active) return;
      ledgerRef.current = state.ledger;
      setLedger(state.ledger);
      setPolicyBook(state.policyBook);
      setMerchantRules(state.merchantRules);
      setStorageReady(true);
      if (migrated) show('기존 데이터를 암호화 저장소로 안전하게 이전했습니다.');
    }).catch(() => { if (active) setStorageError('암호화 저장소를 열지 못했습니다. 앱을 다시 실행해 주세요.'); });
    return () => { active = false; };
  }, [now]);
  useEffect(() => {
    if (!storageReady) return;
    void persistAppState(window.localStorage, { ledger, policyBook, merchantRules }).catch(() => setStorageError('변경 내용을 암호화 저장소에 저장하지 못했습니다.'));
  }, [ledger, merchantRules, policyBook, storageReady]);
  useEffect(() => { merchantRulesRef.current = merchantRules; }, [merchantRules]);

  useEffect(() => {
    if (!nativePlatform) return;
    void AppHealth.getStartupStatus().then(({ forceStopped, eventId }) => {
      setForceStopRecoveryEventId(eventId);
      setForceStopRecovery(forceStopped && window.localStorage.getItem(RECOVERY_DISMISSED_EVENT_KEY) !== eventId);
    }).catch(() => undefined);
  }, [nativePlatform]);
  useEffect(() => {
    if (!nativePlatform) return;
    void refreshNotificationStates();
    let handle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => { if (isActive) void refreshNotificationStates(); })
      .then((listener) => { handle = listener; })
      .catch(() => undefined);
    return () => { if (handle) void handle.remove(); };
  }, [nativePlatform, refreshNotificationStates]);
  useEffect(() => { if (panel === 'operations') void refreshNotificationStates(); }, [panel, refreshNotificationStates]);
  useEffect(() => {
    if (!nativePlatform) return;
    let handle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('backButton', () => {
      setPanel((current) => {
        if (current === 'import') { setInitialImportRoute(false); return null; }
        if (current) return previousPanel(current);
        void CapacitorApp.exitApp();
        return current;
      });
    }).then((listener) => { handle = listener; }).catch(() => undefined);
    return () => { if (handle) void handle.remove(); };
  }, [initialImportRoute, nativePlatform]);

  useEffect(() => {
    void SmsBridge.getConfiguration().then(async (configuration) => {
      if (/^\d{4}$/.test(configuration.cardLast4)) {
        setCard(configuration.cardLast4);
      }
    }).catch(() => undefined);
  }, [nativePlatform]);
  const approvalQueueId = (approval: NativeApproval) => approval.id ?? `${approval.cardLast4}|${approval.occurredAt}|${approval.amount}|${approval.merchant}`;
  const acknowledgeApprovals = (approvals: NativeApproval[]) => SmsBridge.acknowledgePendingApprovals({ ids: approvals.map(approvalQueueId) }).catch(() => undefined);

  const budgetLimits = { resident: getPolicyLimit(policy, 'resident'), studySpace: getPolicyLimit(policy, 'studySpace') };
  const categoryLimits = useMemo(() => Object.fromEntries(POLICY_ITEMS.flatMap((item) => item.ledgerCategories.map((category) => [category, getCategoryLimit(policy, category)]))), [policy]);
  const alertCategories = useMemo(() => getAlertTargets(policy).flatMap((key) => POLICY_ITEMS.find((item) => item.key === key)?.ledgerCategories ?? []), [policy]);
  const [first, second] = ledger.alertThresholds;
  const resident = getSummary(ledger, 'resident', budgetLimits.resident, activePolicy.periodKey);
  const study = getSummary(ledger, 'studySpace', budgetLimits.studySpace, activePolicy.periodKey);
  const totalSpent = resident.spent + study.spent;
  const totalLimit = budgetLimits.resident + budgetLimits.studySpace;
  const totalUsage = roundUsagePercent(totalSpent, totalLimit);
  const rowsFor = (bucket: BudgetKey): Array<[string, number, number]> => POLICY_ITEMS.filter((item) => item.bucket === bucket).map((item) => [item.label, policy.plans[item.key], ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && isEntryInPolicyPeriod(entry, activePolicy.periodKey) && item.ledgerCategories.includes(String(entry.category))).reduce((sum, entry) => sum + entry.amount, 0)]);
  const undecidedEntries = useMemo(() => ledger.entries.filter((entry) => entry.status === 'undecided').slice().sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)), [ledger.entries]);
  const currentUndecided = undecidedEntries.filter((entry) => isEntryInPolicyPeriod(entry, activePolicy.periodKey));
  const previousUndecided = undecidedEntries.filter((entry) => !isEntryInPolicyPeriod(entry, activePolicy.periodKey));
  const undecidedCount = currentUndecided.length;
  const todayEnd = useMemo(() => { const value = new Date(now); value.setHours(23, 59, 59, 999); return value; }, [now]);
  const recent = useMemo(() => getHistoryEntries(ledger, todayEnd), [ledger, todayEnd]);
  const detailTarget = detailTargetId ? ledger.entries.find((entry) => entry.id === detailTargetId) ?? null : null;
  const categorySpent = useMemo(() => Object.fromEntries(POLICY_ITEMS.flatMap((item) => item.ledgerCategories.map((category) => [category, ledger.entries.filter((entry) => entry.status === 'classified' && entry.category === category && isEntryInPolicyPeriod(entry, activePolicy.periodKey)).reduce((sum, entry) => sum + entry.amount, 0)]))), [ledger.entries, activePolicy.periodKey]);
  const quickCategories = useMemo(() => POLICY_ITEMS
    .filter((item) => policy.plans[item.key] > 0)
    .map((item) => ({ category: item.ledgerCategories[0], label: item.label, count: ledger.entries.filter((entry) => entry.status === 'classified' && entry.category === item.ledgerCategories[0] && isEntryInPolicyPeriod(entry, activePolicy.periodKey)).length }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ko'))
    .slice(0, 2)
    .map(({ category, label }) => ({ category, label })), [activePolicy.periodKey, ledger.entries, policy]);
  const widgetDetailRows = useMemo(() => POLICY_ITEMS.map((item) => {
    const entries = ledger.entries.filter((entry) => entry.status === 'classified' && isEntryInPolicyPeriod(entry, activePolicy.periodKey) && item.ledgerCategories.includes(String(entry.category)));
    return { label: item.label, limit: policy.plans[item.key], spent: entries.reduce((sum, entry) => sum + entry.amount, 0), count: entries.length };
  }).filter((item) => item.limit > 0).sort((left, right) => right.count - left.count || right.spent - left.spent || right.limit - left.limit).slice(0, 7).map(({ label, limit, spent }) => ({ label, limit, spent })), [ledger.entries, activePolicy.periodKey, policy]);
  useEffect(() => {
    void SmsBridge.syncBudgetState({ categoryLimits, categorySpent, alertCategories, thresholds: ledger.alertThresholds, periodKey: activePolicy.periodKey, quickCategories }).catch(() => undefined);
  }, [activePolicy.periodKey, alertCategories, categoryLimits, categorySpent, ledger.alertThresholds, quickCategories]);

  useEffect(() => {
    void WidgetBridge.sync({
      ready: activePolicy.confirmed,
      hideAmounts: false,
      totalLimit,
      totalSpent,
      residentLimit: budgetLimits.resident,
      residentSpent: resident.spent,
      studyLimit: budgetLimits.studySpace,
      studySpent: study.spent,
      undecidedCount,
      detailRows: widgetDetailRows,
    }).catch(() => undefined);
  }, [activePolicy.confirmed, budgetLimits.resident, budgetLimits.studySpace, resident.spent, study.spent, totalLimit, totalSpent, undecidedCount, widgetDetailRows]);
  // The Android queue is read first and acknowledged only after the web ledger is persisted.
  // A foreground native event handles new approvals immediately. The initial and
  // visibility checks recover approvals queued while the app was not active.
  useEffect(() => {
    if (!activePolicy.confirmed) return;
    let disposed = false;
    const processPendingApprovals = async () => {
      if (processingApprovalsRef.current) return;
      processingApprovalsRef.current = true;
      try {
        const result = await SmsBridge.consumePendingApprovals();
        if (disposed || !result.items.length) return;
        let nextLedger = ledgerRef.current;
        const crossed = [] as Array<{ alerts: number[]; bucket: BudgetKey; category?: string }>;
        for (const approval of result.items) {
          const applied = applyPayment(nextLedger, approval, { resident: budgetLimits.resident, studySpace: budgetLimits.studySpace }, categoryLimits, (merchant, amount) => classifyWithMerchantRules(merchant, amount, merchantRulesRef.current));
          nextLedger = applied.ledger;
          if (applied.alerts.length) crossed.push({ alerts: applied.alerts, bucket: applied.entry.bucket ?? 'resident', category: applied.entry.category });
        }
        await persistAppState(window.localStorage, { ledger: nextLedger, policyBook, merchantRules: merchantRulesRef.current });
        ledgerRef.current = nextLedger;
        setLedger(nextLedger);
        await acknowledgeApprovals(result.items);
        crossed.forEach((item) => { void sendBudgetAlerts(item.alerts, item.bucket, item.category); });
        show(`${result.items.length}건의 승인 결제를 자동 반영했습니다.`);
      } catch { /* Android approval notification bridge is optional in browser preview. */ }
      finally { processingApprovalsRef.current = false; }
    };
    const initialTimer = window.setTimeout(() => { void processPendingApprovals(); }, 500);
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void SmsBridge.addListener('approvalReceived', () => { void processPendingApprovals(); })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listenerHandle = handle;
      })
      .catch(() => undefined);
    const processWhenVisible = () => { if (document.visibilityState === 'visible') void processPendingApprovals(); };
    document.addEventListener('visibilitychange', processWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      if (listenerHandle) void listenerHandle.remove();
      document.removeEventListener('visibilitychange', processWhenVisible);
    };
  }, [activePolicy.confirmed, activePolicy.periodKey, budgetLimits.resident, budgetLimits.studySpace, categoryLimits, policyBook]);
  const completeOnboarding = async (
    payload: {
      applicantStatus: 'applicant' | 'not-applicant';
      cardLast4: string;
      policy: SupportPolicy | null;
      pendingApprovals: NativeApproval[];
      historyAction: 'keep-undecided' | 'discard';
      nextAction: 'dashboard' | 'import';
    },
  ) => {
    const policyForPeriod = payload.applicantStatus === 'applicant' && payload.policy ? payload.policy : emptyPolicy;
    const confirmed = payload.applicantStatus === 'applicant'
      ? confirmPolicyForPeriod(policyBook, policyForPeriod, activePolicy.periodKey)
      : { versions: [], mode: 'not-applicant' as const };
    let nextLedger = ledgerRef.current;
    if (
      payload.applicantStatus === 'applicant'
      && payload.historyAction === 'keep-undecided'
      && payload.pendingApprovals.length
    ) {
      for (const approval of payload.pendingApprovals) nextLedger = saveAsUndecided(nextLedger, approval).ledger;
    }
    try {
      await persistAppState(window.localStorage, { ledger: nextLedger, policyBook: confirmed, merchantRules });
      setCard(payload.cardLast4);
      setPolicyBook(confirmed);
      ledgerRef.current = nextLedger;
      setLedger(nextLedger);
      if (payload.nextAction === 'import') setImportAfterOnboarding(true);
      if (payload.applicantStatus === 'applicant') {
        await acknowledgeApprovals(payload.pendingApprovals);
        show(payload.historyAction === 'keep-undecided' && payload.pendingApprovals.length ? `${payload.pendingApprovals.length}건을 미정 지출로 불러왔습니다.` : '정책을 확정했습니다.');
      } else {
        show('신청해 지원자 외 모드로 시작해 바로 대시보드에 진입했습니다.');
      }
    } catch { setStorageError('정책을 암호화 저장소에 저장하지 못했습니다. 다시 실행해 주세요.'); }
  };
  useEffect(() => {
    if (!importAfterOnboarding || !activePolicy.confirmed) return;
    setInitialImportRoute(true);
    setPanel('import');
    setImportAfterOnboarding(false);
  }, [activePolicy.confirmed, importAfterOnboarding]);
  const updateAlertThreshold = (index: 0 | 1, rawValue: number) => {
    setLedger((current) => ({ ...current, alertThresholds: clampAlertThreshold(index, rawValue, current.alertThresholds) }));
  };
  const toggleBudgetNotifications = async () => {
    try {
      if (budgetAlertsEnabled) {
        await NotificationBridge.openNotificationSettings();
        show('알림 설정에서 신청해 계산기 알림을 해제해 주세요.');
        return;
      }
      const result = await NotificationBridge.requestPermission();
      setBudgetAlertsEnabled(result.granted);
      show(result.granted ? '예산 경고 알림을 사용합니다.' : '알림 권한이 필요합니다.');
    } catch { show('이 기능은 Android 앱에서 사용할 수 있습니다.'); }
  };
  const sendBudgetAlerts = async (alerts: number[], bucket: BudgetKey, category?: string) => {
    if (!alerts.length) return;
    const target = category ? getCategoryLabel(category) : (bucket === 'resident' ? '정주비' : '학습공간비');
    try { await NotificationBridge.show({ title: '지원금 사용 경고', body: `${target} 잔액이 ${alerts.map((value) => `${100 - value}%`).join(', ')} 남았습니다.` }); }
    catch { show('경고 기준에 도달했습니다. 알림 권한을 확인해 주세요.'); }
  };
  const togglePaymentNotifications = async () => {
    if (card.length !== 4) { show('카드 끝 4자리를 입력해 주세요.'); return; }
    try {
      await SmsBridge.configure({ cardLast4: card });
      await SmsBridge.openNotificationAccessSettings();
      show(paymentAlertsEnabled ? '알림 접근에서 신청해 계산기를 해제해 주세요.' : '알림 접근에서 신청해 계산기를 허용해 주세요.');
    } catch { show('이 기능은 Android 앱에서 사용할 수 있습니다.'); }
  };
  const resetRuleEditor = () => { setRuleMerchant(''); setRuleItemKey('food'); setRuleMatchMode('contains'); setRuleAlias(''); setEditingRuleId(null); };
  const saveMerchantRule = () => {
    const item = POLICY_ITEMS.find((candidate) => candidate.key === ruleItemKey);
    if (!item) return;
    try {
      const created = createMerchantRule(ruleMerchant, { bucket: item.bucket, category: item.ledgerCategories[0] }, new Date().toISOString(), ruleMatchMode, ruleAlias);
      const remaining = merchantRules.filter((current) => current.id !== editingRuleId && current.normalizedMerchant !== created.normalizedMerchant);
      if (remaining.length >= 50) { show('자동 분류 규칙은 최대 50개까지 저장할 수 있습니다.'); return; }
      const previous = merchantRules.find((current) => current.id === editingRuleId);
      const rule = previous ? { ...created, id: previous.id } : created;
      setMerchantRules([...remaining, rule]);
      resetRuleEditor();
      show(previous ? '자동 분류 규칙을 수정했습니다.' : '다음 결제부터 이 상호명 규칙을 적용합니다. 기존 내역은 바꾸지 않습니다.');
    }
    catch (error) { show(error instanceof Error ? error.message : '규칙을 저장하지 못했습니다.'); }
  };
  const editMerchantRule = (rule: MerchantRule) => {
    const item = POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(String(rule.category)));
    setRuleMerchant(rule.merchant);
    if (item) setRuleItemKey(item.key);
    setRuleMatchMode(rule.matchMode ?? 'contains');
    setRuleAlias(rule.alias ?? '');
    setEditingRuleId(rule.id);
  };
  const deleteMerchantRule = (rule: MerchantRule) => {
    if (!window.confirm(`'${rule.merchant}' 자동 분류 규칙을 삭제할까요?`)) return;
    setMerchantRules((current) => current.filter((candidate) => candidate.id !== rule.id));
    if (editingRuleId === rule.id) resetRuleEditor();
    show('자동 분류 규칙을 삭제했습니다.');
  };
  const restoreBackup = (payload: BackupPayload) => {
    setLedger(payload.ledger);
    setPolicyBook(payload.policyBook);
    setMerchantRules(payload.merchantRules);
    ledgerRef.current = payload.ledger;
  };
  const previewImportFile = async () => {
    if (!importFile) return;
    try {
      const transactions = await parseShinhanCardExport(await importFile.arrayBuffer());
      const safety = filterTransactionsForConfiguredCard(transactions, card);
      setImportSafety(safety);
      setImportResult(null);
      if (safety.status === 'rejected') {
        setImportTransactions(null);
        const message = safety.reason === 'ambiguous-card-identity'
          ? '카드 하나만 선택해 결제 내역을 다시 받아 주세요.'
          : safety.reason === 'missing-card'
            ? '카드 끝 4자리를 먼저 설정해 주세요.'
            : '설정한 카드와 일치하는 결제 내역을 찾지 못했습니다.';
        show(message);
        return;
      }
      setImportTransactions(safety.transactions);
      const excluded = safety.skippedOtherCards ? ` · 다른 카드 ${safety.skippedOtherCards}건 제외` : '';
      show(`${safety.transactions.length}\uac74\uc758 \uc2e0\ud55c\uce74\ub4dc Excel \ub0b4\uc5ed\uc744 \ud655\uc778\ud588\uc2b5\ub2c8\ub2e4.${excluded}`);
    } catch (error) {
      setImportTransactions(null);
      setImportSafety(null);
      show(error instanceof Error ? error.message : '파일 형식 또는 비밀번호를 확인해 주세요.');
    }
  };
  const applyCardExport = () => {
    if (!importTransactions) return;
    const result = importCardTransactions(ledger, importTransactions, card);
    setUndoImportLedger(ledger);
    setLedger(result.ledger);
    setImportResult(result);
    setImportTransactions(null);
    setImportFile(null);
    show(result.replacedDemo ? `데모 내역을 실제 ${result.imported}건으로 교체했습니다.` : `${result.imported}건을 가져왔습니다.`);
  };
  const undoLatestImport = () => {
    if (!undoImportLedger) return;
    setLedger(undoImportLedger);
    ledgerRef.current = undoImportLedger;
    setUndoImportLedger(null);
    setImportResult(null);
    show('방금 가져온 결제 내역을 되돌렸습니다.');
  };
  const resetSelectedData = (scopes: Array<'ledger' | 'rules' | 'policy'>) => {
    if (scopes.includes('ledger')) {
      const next = createEmptyLedger();
      setLedger(next);
      ledgerRef.current = next;
      setUndoImportLedger(null);
      setImportResult(null);
    }
    if (scopes.includes('rules')) setMerchantRules([]);
    if (scopes.includes('policy')) setPolicyBook({ versions: [] });
    show('선택한 데이터를 초기화했습니다.');
  };
  const updateEvidenceLink = (entryId: string, evidence: StoredEvidence, attach: boolean) => {
    setLedger((current) => ({ ...current, entries: current.entries.map((entry) => {
      if (entry.id !== entryId) return entry;
      const previous = entry.evidence ?? [];
      const next = attach
        ? previous.some((item) => item.id === evidence.id) ? previous : [...previous, evidence]
        : previous.filter((item) => item.id !== evidence.id);
      return { ...entry, evidence: next };
    }) }));
  };
  const reviewPolicyText = () => {
    if (!policyText.trim()) { show('계획표 내용을 붙여넣어 주세요.'); return; }
    setPolicyDraft({ ...parsePolicyText(policyText), profileId: policy.profileId, alertTargets: getAlertTargets(policy) });
    setPolicyDraftFocusToken((current) => current + 1);
  };
  const readPolicyScreenshot = async () => {
    try {
      const result = await PolicyOcr.pickAndRecognize();
      if (!result.text.trim()) { show('사진에서 읽을 수 있는 텍스트가 없습니다.'); return; }
      setPolicyText(result.text);
      setPolicyDraft({ ...parsePolicyText(result.text), profileId: policy.profileId, alertTargets: getAlertTargets(policy) });
      setPolicyDraftFocusToken((current) => current + 1);
      show('스크린샷의 텍스트를 읽었습니다. 검토 후 확정해 주세요.');
    } catch {
      show('사진 선택 또는 텍스트 인식을 취소했습니다.');
    }
  };
  const updatePolicyDraft = (item: PolicyItem, value: string) => {
    const amount = Number(value.replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount < 0) return;
    setPolicyDraft((current) => current ? { ...current, plans: { ...current.plans, [item]: Math.floor(amount) } } : current);
  };
  const updatePolicyProfile = (profileId: SupportProfileId) => setPolicyDraft((current) => current ? { ...current, profileId } : current);
  const updatePolicyAlertTarget = (item: PolicyItem) => setPolicyDraft((current) => current ? { ...current, alertTargets: getAlertTargets(current).includes(item) ? getAlertTargets(current).filter((target) => target !== item) : [...getAlertTargets(current), item] } : current);
  const confirmPolicy = (applyTo: 'current' | 'next') => {
    if (!policyDraft) return;
    const issues = validatePolicyAgainstProfile(policyDraft);
    if (issues.length) { show(issues[0]); return; }
    const periodKey = applyTo === 'current' ? activePolicy.periodKey : getNextPolicyPeriodKey(now);
    setPolicyBook((current) => confirmPolicyForPeriod(current, policyDraft, periodKey));
    setPolicyDraft(null);
    setPolicyText('');
    show(applyTo === 'current'
      ? '이번 적용 기간 정책을 반영했습니다. 대시보드와 위젯 사용률을 다시 계산합니다.'
      : `${periodKey} 기간 정책을 예약했습니다.`);
  };
  const openSettings = () => {
    setPolicyText('');
    setPolicyDraft(null);
    setPanel('settings');
  };
  const openPayment = () => {
    setManualPayment({ occurredAt: manualDateTimeValue(), merchant: '', amount: '' });
    setManualClassification('auto');
    setPanel('payment');
  };
  const submitManualPayment = () => {
    const merchant = manualPayment.merchant.trim();
    const amount = Number(manualPayment.amount.replaceAll(',', ''));
    const occurredAt = new Date(manualPayment.occurredAt);
    if (!merchant || !Number.isFinite(amount) || amount <= 0 || Number.isNaN(occurredAt.getTime())) { show('결제일시, 상호명, 금액을 확인해 주세요.'); return; }
    const payment: NativeApproval = { id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, cardLast4: card, occurredAt: occurredAt.toISOString(), merchant, amount: Math.floor(amount), source: 'manual' };
    const suspected = findSuspectedDuplicates(ledger, payment);
    if (suspected.length && !window.confirm(`같은 상호명·금액의 결제가 ${suspected.length}건 있습니다. 그래도 등록할까요?`)) return;
    let result: ReturnType<typeof applyPayment>;
    let message: string;
    if (manualClassification === 'undecided') {
      result = saveAsUndecided(ledger, payment);
      message = '미정 지출로 저장했습니다.';
    } else if (manualClassification === 'auto') {
      result = applyPayment(ledger, payment, budgetLimits, categoryLimits, (value, paymentAmount) => classifyWithMerchantRules(value, paymentAmount, merchantRules));
      message = `${classificationText(classifyWithMerchantRules(merchant, amount, merchantRules))}로 저장했습니다.`;
    } else {
      const item = POLICY_ITEMS.find((candidate) => candidate.key === manualClassification);
      if (!item) return;
      const undecided = saveAsUndecided(ledger, payment);
      result = reclassifyUndecided(undecided.ledger, undecided.entry.id, { bucket: item.bucket, category: item.ledgerCategories[0] }, budgetLimits, categoryLimits);
      message = `${item.label}로 저장했습니다.`;
    }
    setLedger(result.ledger);
    if (result.alerts.length) void sendBudgetAlerts(result.alerts, result.entry.bucket ?? 'resident', result.entry.category);
    const alert = result.alerts.length ? ` · ${result.alerts.map((threshold) => `${threshold}% 경고`).join(', ')}` : '';
    close(); show(`${message}${alert}`);
  };
  const beginDetail = (entry: LedgerEntry) => { setDetailTargetId(entry.id); setPanel('detail'); };
  const beginEdit = (entry: LedgerEntry) => { setEditTarget(entry); setPanel('edit'); };
  const saveEditedEntry = (bucket: BudgetKey, category: string) => {
    if (!editTarget) return;
    const merchant = (document.getElementById('edit-merchant') as HTMLInputElement | null)?.value ?? editTarget.merchant;
    const amount = Number((document.getElementById('edit-amount') as HTMLInputElement | null)?.value ?? editTarget.amount);
    const occurredAt = (document.getElementById('edit-occurred-at') as HTMLInputElement | null)?.value ?? editTarget.occurredAt.slice(0, 16);
    const memo = (document.getElementById('edit-memo') as HTMLInputElement | null)?.value ?? editTarget.memo ?? '';
    try { setLedger(updateLedgerEntry(ledger, editTarget.id, { merchant, amount, occurredAt, bucket, category, memo })); setPanel('recent'); show('결제 내역을 수정했습니다.'); }
    catch { show('결제일시, 상호명, 금액을 확인해 주세요.'); }
  };
  const confirmDelete = () => { if (!deleteTarget) return; setLedger(removeLedgerEntry(ledger, deleteTarget.id)); setDetailTargetId(null); setPanel('recent'); show('결제 내역을 삭제했습니다.'); };
  const confirmCancellation = () => {
    if (!cancellationTarget) return;
    setLedger(cancelPayment(ledger, cancellationTarget.id, new Date().toISOString()));
    setPanel('recent');
    show('취소 결제로 처리했습니다. 예산 사용액에서 제외됩니다.');
  };
  const applyUndecidedBatch = (entryIds: string[], item: (typeof POLICY_ITEMS)[number], saveRule: boolean) => {
    let nextLedger = ledger;
    const alerts: number[] = [];
    for (const entryId of entryIds) {
      const result = reclassifyUndecided(nextLedger, entryId, { bucket: item.bucket, category: item.ledgerCategories[0] }, budgetLimits, categoryLimits);
      nextLedger = result.ledger;
      alerts.push(...result.alerts);
    }
    if (saveRule && entryIds.length === 1) {
      const entry = ledger.entries.find((candidate) => candidate.id === entryIds[0]);
      if (entry) {
        const created = createMerchantRule(entry.merchant, { bucket: item.bucket, category: item.ledgerCategories[0] });
        const remaining = merchantRules.filter((current) => current.normalizedMerchant !== created.normalizedMerchant);
        if (remaining.length < 50) setMerchantRules([...remaining, created]);
        else show('분류는 완료했지만 자동 분류 규칙은 최대 50개까지 저장할 수 있습니다.');
      }
    }
    setLedger(nextLedger);
    void sendBudgetAlerts(alerts, item.bucket, item.ledgerCategories[0]);
    show(`${entryIds.length}건을 ${item.label}로 분류했습니다.${saveRule && entryIds.length === 1 ? ' 다음 결제부터 같은 상호명도 자동 분류합니다.' : ''}`);
  };

  let content: ReactNode;
  if (panel === 'resident') content = <Table rows={rowsFor('resident')} />;
  else if (panel === 'study') content = <Table rows={rowsFor('studySpace')} />;
  else if (panel === 'undecided') content = <><p className="undecided-summary">미정 지출 {undecidedCount}건 · 분류 전에는 예산과 경고에 반영되지 않습니다.</p><UndecidedPanel entries={currentUndecided} items={POLICY_ITEMS} onClassify={applyUndecidedBatch} />{previousUndecided.length > 0 && <details className="previous-undecided"><summary>이전 기간 미정 지출 {previousUndecided.length}건</summary><UndecidedPanel entries={previousUndecided} items={POLICY_ITEMS} onClassify={applyUndecidedBatch} /></details>}</>;
  else if (panel === 'recent') content = <PaymentHistory entries={recent} categoryNames={categoryNames} filterOptions={POLICY_ITEMS.map((item) => ({ key: item.ledgerCategories[0], label: item.label }))} isEntryInActivePeriod={(entry) => isEntryInPolicyPeriod(entry, activePolicy.periodKey)} displayMerchant={(entry) => getMerchantAlias(entry.merchant, merchantRules) || entry.merchant} isSuspectedDuplicate={(entry) => findSuspectedDuplicates(ledger, entry, entry.id).length > 0} onOpen={beginDetail} />;
  else if (panel === 'detail') content = detailTarget ? <section className="payment-detail"><div className="payment-detail__hero"><strong>{getMerchantAlias(detailTarget.merchant, merchantRules) || detailTarget.merchant}</strong>{getMerchantAlias(detailTarget.merchant, merchantRules) && <small>원본 결제처 · {detailTarget.merchant}</small>}<span>{new Date(detailTarget.occurredAt).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })}</span><b>{won(detailTarget.amount)}</b><small>{detailTarget.status === 'cancelled' ? '취소됨' : `${detailTarget.bucket === 'resident' ? '정주비' : '학습공간비'} · ${categoryNames[detailTarget.category ?? ''] || '분류 없음'}`}</small>{!isEntryInPolicyPeriod(detailTarget, activePolicy.periodKey) && <p className="period-outside-note">현재 적용 기간 외 결제입니다. 보존되지만 예산·경고·위젯에는 반영되지 않습니다.</p>}{findSuspectedDuplicates(ledger, detailTarget, detailTarget.id).length > 0 && <p className="duplicate-note">같은 상호명과 금액의 유사 결제가 있습니다. 실제 중복인지 확인해 주세요.</p>}{detailTarget.memo && <p className="payment-memo">메모 · {detailTarget.memo}</p>}</div>{detailTarget.status === 'classified' && <div className="payment-detail__actions"><button className="sheet-action" onClick={() => beginEdit(detailTarget)}>수정 · 분류 변경</button><button className="sheet-action secondary-action" onClick={() => { setCancellationTarget(detailTarget); setPanel('cancel'); }}>취소 확인</button><button className="sheet-action danger-action" onClick={() => { setDeleteTarget(detailTarget); setPanel('delete'); }}>삭제</button></div>}</section> : <p>결제 내역을 찾지 못했습니다.</p>;
  else if (panel === 'edit') content = editTarget ? <><p>수정한 내역은 수동 입력 내역으로 기록됩니다.</p><label>결제일시<input id="edit-occurred-at" aria-label="수정 결제일시" type="datetime-local" defaultValue={editTarget.occurredAt.slice(0, 16)} /></label><label>상호명<input id="edit-merchant" aria-label="수정 상호명" defaultValue={editTarget.merchant} /></label><label>금액<input id="edit-amount" aria-label="수정 금액" type="number" inputMode="numeric" min="1" defaultValue={editTarget.amount} /></label><label>분류<select id="edit-category" aria-label="수정 분류" defaultValue={POLICY_ITEMS.find((item) => item.ledgerCategories.includes(String(editTarget.category)))?.key ?? 'food'}>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label><label>메모 (선택)<input id="edit-memo" aria-label="결제 메모" defaultValue={editTarget.memo ?? ''} placeholder="예: 스터디 모임" maxLength={80} /></label><button className="sheet-action" onClick={() => { const item = POLICY_ITEMS.find((candidate) => candidate.key === (document.getElementById('edit-category') as HTMLSelectElement | null)?.value); if (item) saveEditedEntry(item.bucket, item.ledgerCategories[0]); }}>수정 저장</button></> : <p>수정할 결제가 없습니다.</p>;
  else if (panel === 'delete') content = deleteTarget ? <><p>삭제하면 이 앱의 결제 내역과 예산 사용액에서 제거됩니다. 카드사·은행 원본 내역은 삭제되지 않습니다.</p><div className="item"><strong>{deleteTarget.merchant}</strong><span>{deleteTarget.occurredAt.slice(0, 10)} · {won(deleteTarget.amount)}</span></div><button className="sheet-action danger-action" onClick={confirmDelete}>결제 내역 삭제</button></> : <p>삭제할 결제가 없습니다.</p>;
  else if (panel === 'cancel') content = cancellationTarget ? <><p>실제 취소가 확인된 경우에만 확정하세요. 취소 확정 후에는 이 결제의 예산 사용액이 제외됩니다.</p><div className="item"><strong>{cancellationTarget.merchant}</strong><span>{cancellationTarget.occurredAt.slice(0, 10)} · {won(cancellationTarget.amount)}</span></div><button className="sheet-action danger-action" onClick={confirmCancellation}>취소 확정</button></> : <p>확인할 결제가 없습니다.</p>;
  else if (panel === 'evidence') content = <EvidenceExport entries={ledger.entries} onUpdateEvidence={updateEvidenceLink} />;
  else if (panel === 'import') content = <TransactionImport cardLast4={card} notify={show} onImport={(transactions) => { const result = importCardTransactions(ledger, transactions, card); setLedger(result.ledger); leaveImport(); show(result.replacedDemo ? '데모 내역을 실제 ' + result.imported + '건으로 교체했습니다.' : result.imported + '건을 가져왔습니다.'); }} />;
  else if (panel === 'rules') content = <section className="rule-manager"><p>결제처에 키워드가 포함되면 자동 분류합니다. 정확 일치는 상호명 전체가 같을 때만 적용됩니다.</p><div className="rule-editor"><label>상호명 또는 키워드<input aria-label="규칙 상호명" value={ruleMerchant} onChange={(event) => setRuleMerchant(event.target.value)} placeholder="예: 메가커피" /></label><label>표시 별칭 (선택)<input aria-label="규칙 표시 별칭" value={ruleAlias} onChange={(event) => setRuleAlias(event.target.value)} placeholder="예: 스터디 카페" maxLength={40} /></label><label>인식 방법<select aria-label="규칙 인식 방법" value={ruleMatchMode} onChange={(event) => setRuleMatchMode(event.target.value as MerchantMatchMode)}><option value="contains">포함</option><option value="exact">정확히 일치</option></select></label><label>분류 항목<select aria-label="규칙 분류" value={ruleItemKey} onChange={(event) => setRuleItemKey(event.target.value as PolicyItem)}>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label><button className="sheet-action" onClick={saveMerchantRule}>{editingRuleId ? '규칙 수정 저장' : '규칙 추가'}</button>{editingRuleId && <button className="sheet-action secondary-action" onClick={resetRuleEditor}>수정 취소</button>}</div><div className="rule-management-list"><strong>저장된 자동 분류 규칙 {merchantRules.length}/50</strong>{merchantRules.length ? [...merchantRules].sort((a, b) => a.merchant.localeCompare(b.merchant, 'ko')).map((rule) => <article key={rule.id}><div><strong>{rule.alias || rule.merchant}</strong><span>{rule.alias ? `${rule.merchant} · ` : ''}{(rule.matchMode ?? 'contains') === 'contains' ? '포함' : '정확히 일치'} · {categoryNames[rule.category]}</span></div><button type="button" onClick={() => editMerchantRule(rule)}>수정</button><button type="button" className="delete-action" onClick={() => deleteMerchantRule(rule)}>삭제</button></article>) : <p>저장된 자동 분류 규칙이 없습니다.</p>}</div></section>;
  else if (panel === 'settings') content = <section className="settings-hub"><p>필요한 설정만 선택해 관리하세요.</p><button className="settings-destination" onClick={() => setPanel('operations')}><strong>운영 설정</strong><span>카드 · 결제 알림 · 예산 경고</span><CaretRight size={26} /></button><button className="settings-destination" onClick={() => setPanel('data')}><strong>데이터 관리</strong><span>계획표 · 거래내역 · 백업</span><CaretRight size={26} /></button><a className="settings-destination settings-feedback" href="mailto:cjsan30@gmail.com?subject=%5B%EC%8B%A0%EC%B2%AD%ED%95%B4%20%EA%B3%84%EC%82%B0%EA%B8%B0%5D%20%ED%94%BC%EB%93%9C%EB%B0%B1"><strong>피드백 보내기</strong><span>불편한 점과 개선 의견을 알려주세요</span><CaretRight size={26} /></a><details className="privacy-notice"><summary>개인정보 처리 안내</summary><h3>결제 알림 처리</h3><p>삼성 메시지 또는 신한 SOL 알림 중 등록한 카드 끝 4자리와 일치하는 신한카드 승인 알림만 기기 안에서 처리합니다. 같은 승인이 두 앱에 표시되면 한 건으로 합칩니다. 거래 시각·금액·상호명·분류만 저장하며 원문 알림과 다른 대화는 저장·전송·삭제하지 않습니다.</p><h3>저장과 보안</h3><p>거래·정책·자동 분류 규칙은 기기 내부 암호화 저장소에 보관합니다. 서버나 제3자 분석 서비스로 전송하지 않습니다.</p><h3>권한과 대체 입력</h3><p>알림 접근은 Android 시스템 설정에서 언제든 해제할 수 있습니다. 자동 인식이 중단된 기간은 신한카드 엑셀 가져오기 또는 직접 지출 등록으로 보완할 수 있습니다.</p><h3>삭제와 백업</h3><p>개별 결제는 결제 상세에서 삭제할 수 있고, 앱 데이터 초기화 또는 앱 삭제 시 기기 내부 데이터가 삭제됩니다. 암호화 백업은 사용자가 직접 생성·관리합니다.</p><a href="https://cjsan30.github.io/shinhanaccount/privacy-policy.html" target="_blank" rel="noreferrer">전체 개인정보처리방침 보기</a></details></section>;
  else if (panel === 'operations') content = <section className="operations-settings"><p>결제 수신과 예산 경고를 관리합니다. 버튼 문구로 현재 사용 상태를 확인할 수 있습니다.</p><label>카드 끝 4자리<input aria-label="카드 끝 4자리" type={showCard ? 'text' : 'password'} inputMode="numeric" maxLength={4} value={card} onChange={(event) => { const value = event.target.value.replace(/\D/g, ''); setCard(value); if (value.length === 4) void SmsBridge.configure({ cardLast4: value }); }} /></label><button className="mask-toggle" type="button" onClick={() => setShowCard((current) => !current)}>{showCard ? '숨기기' : '보기'}</button><button className={`sheet-action status-action ${paymentAlertsEnabled ? 'is-enabled' : ''}`} onClick={() => void togglePaymentNotifications()}>{paymentAlertsEnabled ? '결제 알림 수신 해제' : '결제 알림 수신 설정'}</button><button className={`sheet-action status-action ${budgetAlertsEnabled ? 'is-enabled' : ''}`} onClick={() => void toggleBudgetNotifications()}>{budgetAlertsEnabled ? '예산 경고 알림 해제' : '예산 경고 알림 설정'}</button><AlertThresholdSettings first={first} second={second} onChange={updateAlertThreshold} /><SmsDiagnostics notify={show} /></section>;
  else if (panel === 'data') content = <DataManagementPanel importFile={importFile} importTransactions={importTransactions} importResult={importResult} hasMaskedCardWarning={Boolean(importSafety?.hasMaskedCardWarning)} policyText={policyText} policyDraft={policyDraft} policyDraftFocusToken={policyDraftFocusToken} merchantRules={merchantRules} ledger={ledger} policyBook={policyBook} periodKey={activePolicy.periodKey} canUndoImport={Boolean(undoImportLedger)} onUndoImport={undoLatestImport} onResetData={resetSelectedData} onFileSelected={(file) => { setImportFile(file); setImportTransactions(null); setImportResult(null); setImportSafety(null); }} onPreviewImport={() => void previewImportFile()} onApplyImport={applyCardExport} onOpenImportGuide={() => setPanel('import')} onPolicyTextChange={setPolicyText} onReviewPolicy={reviewPolicyText} onReadPolicyScreenshot={() => void readPolicyScreenshot()} onUpdatePolicyDraft={updatePolicyDraft} onUpdatePolicyProfile={updatePolicyProfile} onUpdatePolicyAlertTarget={updatePolicyAlertTarget} onConfirmPolicy={confirmPolicy} onOpenRules={() => { resetRuleEditor(); setPanel('rules'); }} onRestore={restoreBackup} notify={show} />;
  else content = <><p>직접 입력한 지출은 자동 인식된 승인 내역과 별도로 저장됩니다. 같은 결제를 중복 등록하지 않도록 확인해 주세요.</p><label>결제일시<input aria-label="결제일시" type="datetime-local" value={manualPayment.occurredAt} onChange={(event) => setManualPayment((current) => ({ ...current, occurredAt: event.target.value }))} /></label><label>상호명<input aria-label="상호명" value={manualPayment.merchant} onChange={(event) => setManualPayment((current) => ({ ...current, merchant: event.target.value }))} placeholder="예: 스타벅스" /></label><label>금액<input aria-label="금액" type="number" inputMode="numeric" min="1" step="1" value={manualPayment.amount} onChange={(event) => setManualPayment((current) => ({ ...current, amount: event.target.value }))} placeholder="0" /></label><label>분류<select aria-label="지출 분류" value={manualClassification} onChange={(event) => setManualClassification(event.target.value as ManualClassificationChoice)}><option value="auto">자동 분류</option><option value="undecided">미정으로 저장</option>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label>{manualClassification === 'auto' && <p className="prediction">{manualPayment.merchant.trim() && Number(manualPayment.amount) > 0 ? <>자동 분류 예상: <strong>{classificationText(classifyWithMerchantRules(manualPayment.merchant, Number(manualPayment.amount), merchantRules))}</strong></> : '상호명과 금액을 입력하면 예상 분류를 보여드립니다.'}</p>}<button className="sheet-action" onClick={submitManualPayment}>지출 등록</button></>;
  const title = panel === 'resident' ? '정주비 상세' : panel === 'study' ? '학습공간비 상세' : panel === 'undecided' ? '미정 지출' : panel === 'recent' ? '결제 내역 확인' : panel === 'detail' ? '결제 상세' : panel === 'cancel' ? '취소 확인' : panel === 'edit' ? '결제 내역 수정' : panel === 'delete' ? '결제 내역 삭제' : panel === 'settings' ? '설정' : panel === 'operations' ? '운영 설정' : panel === 'data' ? '데이터 관리' : panel === 'rules' ? '자동 분류 규칙' : panel === 'evidence' ? 'PDF 생성' : panel === 'import' ? '거래내역 등록' : '직접 지출 등록';
  if (storageError) return <main className="storage-status"><h1>데이터를 열지 못했습니다</h1><p>{storageError}</p><button onClick={() => window.location.reload()}>다시 시도</button></main>;
  if (!storageReady) return <main className="storage-status"><h1>데이터를 안전하게 불러오는 중</h1><p>암호화 저장소를 확인하고 있습니다.</p></main>;
  if (!activePolicy.confirmed) return <Suspense fallback={<main className="storage-status"><LoadingPanel /></main>}><OnboardingFlow onComplete={completeOnboarding} /></Suspense>;
  if (panel === 'import') return <main className="import-page">
    <header className="import-page__header"><span>지원금 관리</span><button type="button" onClick={leaveImport}>나중에 등록하기</button></header>
    <h1>결제내역을<br />등록할까요?</h1>
    <p>이미 결제한 내역이 있다면 신한 SOL Pay에서 저장한 엑셀을 가져와 등록하세요.</p>
    <Suspense fallback={<LoadingPanel />}>{content}</Suspense>
  </main>;

  return <main className="app">
    <DashboardScreen
      totalLimit={totalLimit}
      totalSpent={totalSpent}
      totalUsage={totalUsage}
      resident={{ remaining: resident.remaining, usage: resident.usagePercent }}
      study={{ remaining: study.remaining, usage: study.usagePercent }}
      undecidedCount={undecidedCount}
      forceStopRecovery={forceStopRecovery}
      onOpenSettings={openSettings}
      onDismissRecovery={() => { if (forceStopRecoveryEventId) window.localStorage.setItem(RECOVERY_DISMISSED_EVENT_KEY, forceStopRecoveryEventId); setForceStopRecovery(false); }}
      onRecoverTransactions={() => { if (forceStopRecoveryEventId) window.localStorage.setItem(RECOVERY_DISMISSED_EVENT_KEY, forceStopRecoveryEventId); setForceStopRecovery(false); setInitialImportRoute(false); setPanel('import'); }}
      onNewPayment={openPayment}
      onOpenResident={() => setPanel('resident')}
      onOpenStudy={() => setPanel('study')}
      onOpenUndecided={() => setPanel('undecided')}
      onOpenRecent={() => setPanel('recent')}
      onOpenEvidence={() => setPanel('evidence')}
    />
    {panel && <BottomSheet title={title} onClose={close} onBack={previousPanel(panel) ? () => setPanel(previousPanel(panel)) : undefined}><Suspense fallback={<LoadingPanel />}>{content}</Suspense></BottomSheet>}
    <Toast message={toast} />
  </main>;
}
export default App;
