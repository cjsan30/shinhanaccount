import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CaretRight, ChatCircleDots, GearSix, ListBullets, Plus } from '@phosphor-icons/react';
import { BottomSheet } from './components/BottomSheet';
import { EvidenceExport } from './components/EvidenceExport';
import { BackupRestore } from './components/BackupRestore';
import { OnboardingFlow } from './components/OnboardingFlow';
import { Toast } from './components/Toast';
import { type BudgetKey } from './domain/budget';
import { applyPayment, cancelPayment, createEmptyLedger, createInitialLedger, getEntryPeriodKey, getSummary, importCardTransactions, loadLedger, reclassifyUndecided, saveAsUndecided, saveLedger, type ImportResult, type Ledger, type LedgerEntry } from './domain/ledger';
import { parseShinhanCardExport, type ImportedCardTransaction } from './domain/shinhanImport';
import { filterTransactionsForConfiguredCard } from './domain/cardImportSafety';
import { parseShinhanBankPdf } from './domain/shinhanBankPdf';
import { confirmPolicyForPeriod, getEffectivePolicy, getCategoryLabel, getCategoryLimit, getNextPolicyPeriodKey, getPolicyLimit, getPolicyVersion, loadPolicyBook, parsePolicyText, POLICY_ITEMS, savePolicyBook, type PolicyItem, type SupportPolicy } from './domain/policy';
import { classifyPayment, type PaymentClassification } from './domain/sms';
import { SmsBridge, type NativeApproval } from './native/smsBridge';
import { createTestApproval } from './native/testApproval';
import { PolicyOcr } from './native/policyOcr';
import { NotificationBridge } from './native/notificationBridge';
import type { BackupPayload } from './domain/backup';
import './App.css';

type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'cancel' | 'settings' | 'evidence' | 'payment' | null;
const ONBOARDING_PERMISSION_KEY = 'shinhanhae-permissions-ready-v1';
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const defaultPayment: NativeApproval = { cardLast4: '', occurredAt: '2026-07-24T17:58:00+09:00', amount: 8000, merchant: '삼성웰스토리(주)크래프톤정' };
const categoryNames: Record<string, string> = { lodging: '주거비', food: '식비', education: '교육비', transport: '교통비', studyCafe: '스터디카페', generalCafe: '카페', readingRoom: '독서실' };

function classificationText(result: PaymentClassification) {
  if (result.status === 'excluded') return '제외 대상으로 분류';
  if (result.status === 'undecided') return '미정 — 직접 분류가 필요';
  return `${result.bucket === 'resident' ? '정주비' : '학습공간비'} · ${categoryNames[result.category]}`;
}
function Budget({ name, remaining, usage, open }: { name: string; remaining: number; usage: number; open: () => void }) {
  return <button className="budget" onClick={open} aria-label={`${name} 상세 보기`}><span><strong>{name}</strong><em>잔액 {won(remaining)}</em><CaretRight size={27} weight="bold" /></span><i><b style={{ width: `${Math.min(100, usage)}%` }} /></i><small>{usage.toFixed(1)}% 사용</small></button>;
}
function Table({ rows }: { rows: Array<[string, number, number]> }) {
  return <div className="table"><div><span>항목</span><span>계획</span><span>사용</span><span>잔액</span></div>{rows.map(([name, plan, used]) => <div key={name}><strong>{name}</strong><span>{won(plan)}</span><span>{won(used)}</span><span>{won(plan - used)}</span></div>)}</div>;
}
function App() {
  const [panel, setPanel] = useState<Panel>(null);
  const [card, setCard] = useState('');
  const [showCard, setShowCard] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [payment, setPayment] = useState<NativeApproval>(defaultPayment);
  const [ledger, setLedger] = useState<Ledger>(() => loadLedger(window.localStorage, import.meta.env.PROD ? createEmptyLedger : createInitialLedger));
  const ledgerRef = useRef(ledger);
  const [importTransactions, setImportTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState('');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importSafety, setImportSafety] = useState<ReturnType<typeof filterTransactionsForConfiguredCard> | null>(null);
  const now = useMemo(() => new Date(), []);
  const [policyBook, setPolicyBook] = useState(() => loadPolicyBook(window.localStorage, now));
  const activePolicy = getEffectivePolicy(policyBook, now);
  const policy = activePolicy.policy;
  const [policyText, setPolicyText] = useState('');
  const [policyDraft, setPolicyDraft] = useState<SupportPolicy | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<LedgerEntry | null>(null);
  const close = () => setPanel(null);
  const show = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };
  useEffect(() => { ledgerRef.current = ledger; saveLedger(window.localStorage, ledger); }, [ledger]);
  useEffect(() => { savePolicyBook(window.localStorage, policyBook); }, [policyBook]);
  useEffect(() => {
    void SmsBridge.getConfiguration().then((configuration) => {
      if (/^\d{4}$/.test(configuration.cardLast4)) {
        setCard(configuration.cardLast4);
      }
    }).catch(() => undefined);
  }, []);
  const approvalQueueId = (approval: NativeApproval) => approval.id ?? `${approval.cardLast4}|${approval.occurredAt}|${approval.amount}|${approval.merchant}`;
  const acknowledgeApprovals = (approvals: NativeApproval[]) => SmsBridge.acknowledgePendingApprovals({ ids: approvals.map(approvalQueueId) }).catch(() => undefined);

  const budgetLimits = { resident: getPolicyLimit(policy, 'resident'), studySpace: getPolicyLimit(policy, 'studySpace') };
  const categoryLimits = useMemo(() => Object.fromEntries(POLICY_ITEMS.flatMap((item) => item.ledgerCategories.map((category) => [category, getCategoryLimit(policy, category)]))), [policy]);
  const [first, second] = ledger.alertThresholds;
  const resident = getSummary(ledger, 'resident', budgetLimits.resident, activePolicy.periodKey);
  const study = getSummary(ledger, 'studySpace', budgetLimits.studySpace, activePolicy.periodKey);
  const totalSpent = resident.spent + study.spent;
  const totalLimit = budgetLimits.resident + budgetLimits.studySpace;
  const totalUsage = (totalSpent / totalLimit) * 100;
  const rowsFor = (bucket: BudgetKey): Array<[string, number, number]> => POLICY_ITEMS.filter((item) => item.bucket === bucket).map((item) => [item.label, policy.plans[item.key], ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && getEntryPeriodKey(entry) === activePolicy.periodKey && item.ledgerCategories.includes(String(entry.category))).reduce((sum, entry) => sum + entry.amount, 0)]);
  const undecidedCount = ledger.entries.filter((entry) => entry.status === 'undecided' && getEntryPeriodKey(entry) === activePolicy.periodKey).length;
  const recent = useMemo(() => ledger.entries.filter((entry) => (entry.status === 'classified' || entry.status === 'cancelled') && getEntryPeriodKey(entry) === activePolicy.periodKey).slice(-8).reverse(), [ledger.entries, activePolicy.periodKey]);
  const categorySpent = useMemo(() => Object.fromEntries(POLICY_ITEMS.flatMap((item) => item.ledgerCategories.map((category) => [category, ledger.entries.filter((entry) => entry.status === 'classified' && entry.category === category && getEntryPeriodKey(entry) === activePolicy.periodKey).reduce((sum, entry) => sum + entry.amount, 0)]))), [ledger.entries, activePolicy.periodKey]);
  useEffect(() => {
    void SmsBridge.syncBudgetState({ categoryLimits, categorySpent, thresholds: ledger.alertThresholds, periodKey: activePolicy.periodKey }).catch(() => undefined);
  }, [activePolicy.periodKey, categoryLimits, categorySpent, ledger.alertThresholds]);

  // The Android queue is read first and acknowledged only after the web ledger is persisted.
  useEffect(() => {
    if (import.meta.env.MODE === 'test' || !activePolicy.confirmed) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await SmsBridge.consumePendingApprovals();
          if (!result.items.length) return;
          let nextLedger = ledgerRef.current;
          const crossed = [] as Array<{ alerts: number[]; bucket: BudgetKey; category?: string }>;
          for (const approval of result.items) {
            const applied = applyPayment(nextLedger, approval, budgetLimits, categoryLimits);
            nextLedger = applied.ledger;
            if (applied.alerts.length) crossed.push({ alerts: applied.alerts, bucket: applied.entry.bucket ?? 'resident', category: applied.entry.category });
          }
          ledgerRef.current = nextLedger;
          saveLedger(window.localStorage, nextLedger);
          setLedger(nextLedger);
          await acknowledgeApprovals(result.items);
          crossed.forEach((item) => { void sendBudgetAlerts(item.alerts, item.bucket, item.category); });
          show(`${result.items.length}건의 승인 결제를 자동 반영했습니다.`);
        } catch { /* Android SMS bridge is optional in browser preview. */ }
      })();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activePolicy.confirmed, activePolicy.periodKey, budgetLimits.resident, budgetLimits.studySpace, categoryLimits]);
  const completeOnboarding = (payload: { cardLast4: string; policy: SupportPolicy; pendingApprovals: NativeApproval[]; historyAction: 'keep-undecided' | 'discard' }) => {
    const confirmed = confirmPolicyForPeriod(policyBook, payload.policy, activePolicy.periodKey);
    setCard(payload.cardLast4);
    setPolicyBook(confirmed);
    window.localStorage.setItem(ONBOARDING_PERMISSION_KEY, 'true');
    if (payload.historyAction === 'keep-undecided' && payload.pendingApprovals.length) {
      let nextLedger = ledgerRef.current;
      for (const approval of payload.pendingApprovals) nextLedger = saveAsUndecided(nextLedger, approval).ledger;
      ledgerRef.current = nextLedger;
      saveLedger(window.localStorage, nextLedger);
      setLedger(nextLedger);
    }
    void acknowledgeApprovals(payload.pendingApprovals);
    show(payload.historyAction === 'keep-undecided' && payload.pendingApprovals.length ? `${payload.pendingApprovals.length}건을 미정 지출로 불러왔습니다.` : '정책을 확정했습니다.');
  };
  const updateAlertThreshold = (index: 0 | 1, rawValue: number) => {
    setLedger((current) => {
      const [lower, upper] = current.alertThresholds;
      const thresholds: [number, number] = index === 0 ? [Math.min(rawValue, upper - 1), upper] : [lower, Math.max(rawValue, lower + 1)];
      return { ...current, alertThresholds: thresholds };
    });
  };
  const enableNotifications = async () => {
    try { const result = await NotificationBridge.requestPermission(); show(result.granted ? '예산 경고 알림을 사용합니다.' : '알림 권한이 필요합니다.'); }
    catch { show('이 기능은 Android 앱에서 사용할 수 있습니다.'); }
  };
  const sendBudgetAlerts = async (alerts: number[], bucket: BudgetKey, category?: string) => {
    if (!alerts.length) return;
    const target = category ? getCategoryLabel(category) : (bucket === 'resident' ? '정주비' : '학습공간비');
    try { await NotificationBridge.show({ title: '지원금 사용 경고', body: `${target}가 ${alerts.map((value) => `${value}%`).join(', ')} 기준에 도달했습니다.` }); }
    catch { show('경고 기준에 도달했습니다. 알림 권한을 확인해 주세요.'); }
  };
  const sendTestNotification = async () => {
    try {
      const permission = await NotificationBridge.requestPermission();
      if (!permission.granted) { show('알림 권한을 허용해 주세요.'); return; }
      await NotificationBridge.show({ title: '지원금 알림 테스트', body: '알림 권한과 표시 상태가 정상입니다.' });
      show('테스트 알림을 보냈습니다.');
    } catch { show('테스트 알림을 보낼 수 없습니다. 알림 권한을 확인해 주세요.'); }
  };  const enableSms = async () => {
    if (card.length !== 4) { show('카드 끝 4자리를 입력해 주세요.'); return; }
    try { await SmsBridge.configure({ cardLast4: card }); const result = await SmsBridge.requestPermission(); show(result.granted ? 'SMS 수신을 사용할 수 있습니다.' : 'SMS 수신 권한이 필요합니다.'); }
    catch { show('이 기능은 Android 앱에서 사용할 수 있습니다.'); }
  };
  const restoreBackup = (payload: BackupPayload) => {
    setLedger(payload.ledger);
    setPolicyBook(payload.policyBook);
    ledgerRef.current = payload.ledger;
    saveLedger(window.localStorage, payload.ledger);
    savePolicyBook(window.localStorage, payload.policyBook);
  };
  const previewImportFile = async () => {
    if (!importFile) return;
    try {
      const isPdf = importFile.name.toLowerCase().endsWith('.pdf');
      const transactions = isPdf ? await parseShinhanBankPdf(await importFile.arrayBuffer(), importPassword) : parseShinhanCardExport(await importFile.arrayBuffer());
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
      show(`${safety.transactions.length}건의 ${isPdf ? '은행 PDF' : '카드 엑셀'} 내역을 확인했습니다.${excluded}`);
    } catch (error) {
      setImportTransactions(null);
      setImportSafety(null);
      show(error instanceof Error ? error.message : '파일 형식 또는 비밀번호를 확인해 주세요.');
    }
  };
  const applyCardExport = () => {
    if (!importTransactions) return;
    const result = importCardTransactions(ledger, importTransactions, card);
    setLedger(result.ledger);
    setImportResult(result);
    setImportTransactions(null);
    setImportFile(null);
    setImportPassword('');
    show(result.replacedDemo ? `데모 내역을 실제 ${result.imported}건으로 교체했습니다.` : `${result.imported}건을 가져왔습니다.`);
  };
  const reviewPolicyText = () => {
    if (!policyText.trim()) { show('계획표 내용을 붙여넣어 주세요.'); return; }
    setPolicyDraft(parsePolicyText(policyText));
  };
  const readPolicyScreenshot = async () => {
    try {
      const result = await PolicyOcr.pickAndRecognize();
      if (!result.text.trim()) { show('사진에서 읽을 수 있는 텍스트가 없습니다.'); return; }
      setPolicyText(result.text);
      setPolicyDraft(parsePolicyText(result.text));
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
  const confirmPolicy = () => {
    if (!policyDraft) return;
    setPolicyBook((current) => confirmPolicyForPeriod(current, policyDraft, getNextPolicyPeriodKey(now))); 
    setPolicyDraft(null);
    setPolicyText('');
    show(`${getNextPolicyPeriodKey(now)} 기간 정책을 저장했습니다.`);
  };
  const openSettings = () => {
    const scheduled = getPolicyVersion(policyBook, getNextPolicyPeriodKey(now)) ?? policy;
    setPolicyText(scheduled.sourceText);
    setPolicyDraft(structuredClone(scheduled));
    setPanel('settings');
  };
  const openPayment = async () => {
    try { const result = await SmsBridge.consumePendingApprovals(); if (result.items[0]) setPayment(result.items[0]); }
    catch { /* Browser preview uses the sample payment. */ }
    setPanel('payment');
  };
  const injectTestApproval = async () => {
    const approval = createTestApproval(card);
    setPayment(approval);
    setPanel('payment');
    try {
      await SmsBridge.injectTestApproval(approval);
      show('네이티브 테스트 승인과 알림을 보냈습니다.');
    } catch {
      show('브라우저에서는 결제 확인 화면으로만 테스트합니다.');
    }
  };
  const scheduleTestApproval = async () => {
    try {
      await SmsBridge.scheduleTestApproval({ approval: createTestApproval(card), delayMs: 10_000 });
      show('10초 뒤 테스트 승인 알림이 옵니다. 지금 앱을 홈 화면으로 보내세요.');
    } catch {
      show('예약 테스트는 Android 내부 테스트 앱에서만 사용할 수 있습니다.');
    }
  };  const applyAutomatic = () => {
    const result = applyPayment(ledger, payment, budgetLimits, categoryLimits);
    setLedger(result.ledger);
    saveLedger(window.localStorage, result.ledger);
    void acknowledgeApprovals([payment]);
    void sendBudgetAlerts(result.alerts, result.entry.bucket ?? 'resident', result.entry.category);
    const alert = result.alerts.length ? ` · ${result.alerts.map((threshold) => `${threshold}% 경고`).join(', ')}` : '';
    close(); show(`${classificationText(classifyPayment(payment.merchant, payment.amount))}로 저장했습니다.${alert}`);
  };
  const beginCancellation = (entry: LedgerEntry) => { setCancellationTarget(entry); setPanel('cancel'); };
  const confirmCancellation = () => {
    if (!cancellationTarget) return;
    setLedger(cancelPayment(ledger, cancellationTarget.id, new Date().toISOString()));
    close();
    show('취소 결제로 처리했습니다. 예산 사용액에서 제외됩니다.');
  };
  const applyManualClassification = (entryId: string, item: (typeof POLICY_ITEMS)[number]) => {
    const result = reclassifyUndecided(ledger, entryId, { bucket: item.bucket, category: item.ledgerCategories[0] }, budgetLimits, categoryLimits);
    setLedger(result.ledger);
    void sendBudgetAlerts(result.alerts, item.bucket, item.ledgerCategories[0]);
    const alert = result.alerts.length ? ` · ${result.alerts.map((threshold) => `${threshold}% 경고`).join(', ')}` : '';
    show(`${item.label}로 분류했습니다.${alert}`);
  };
  const saveUndecided = () => { const result = saveAsUndecided(ledger, payment); setLedger(result.ledger); saveLedger(window.localStorage, result.ledger); void acknowledgeApprovals([payment]); close(); show('미정 지출로 저장했습니다.'); };

  let content: ReactNode;
  if (panel === 'resident') content = <Table rows={rowsFor('resident')} />;
  else if (panel === 'study') content = <Table rows={rowsFor('studySpace')} />;
  else if (panel === 'undecided') content = undecidedCount ? <>{ledger.entries.filter((entry) => entry.status === 'undecided').map((entry) => <section className="reclassify-card" key={entry.id}><div className="item"><strong>{entry.merchant}</strong><span>{entry.occurredAt.slice(0, 10)} · {won(entry.amount)}</span></div><p>지원 항목을 선택하면 즉시 예산에 반영됩니다.</p><div className="reclassify-options">{POLICY_ITEMS.map((item) => <button key={item.key} onClick={() => applyManualClassification(entry.id, item)}>{item.label}</button>)}</div></section>)}</> : <p>미정으로 보관된 지출이 없습니다.</p>;  else if (panel === 'recent') content = recent.length ? <>{recent.map((entry) => <section className="recent-card" key={entry.id}><div className="item"><strong>{entry.merchant} · {entry.status === 'cancelled' ? '취소됨' : categoryNames[entry.category ?? '']}</strong><span>{won(entry.amount)}</span></div>{entry.status === 'classified' && <button className="cancel-action" onClick={() => beginCancellation(entry)}>이 결제 취소 확인</button>}</section>)}</> : <p>저장된 결제가 없습니다.</p>;
  else if (panel === 'cancel') content = cancellationTarget ? <><p>실제 취소가 확인된 경우에만 확정하세요. 취소 확정 후에는 이 결제의 예산 사용액이 제외됩니다.</p><div className="item"><strong>{cancellationTarget.merchant}</strong><span>{cancellationTarget.occurredAt.slice(0, 10)} · {won(cancellationTarget.amount)}</span></div><button className="sheet-action danger-action" onClick={confirmCancellation}>취소 확정</button></> : <p>확인할 결제가 없습니다.</p>;  else if (panel === 'evidence') content = <EvidenceExport />;
  else if (panel === 'settings') content = <><p>카드 끝 4자리가 일치하는 신한 체크 승인 문자만 처리합니다.</p><label>카드 끝 4자리<input aria-label="카드 끝 4자리" type={showCard ? 'text' : 'password'} inputMode="numeric" maxLength={4} value={card} onChange={(event) => setCard(event.target.value.replace(/\D/g, ''))} /></label><button className="mask-toggle" type="button" onClick={() => setShowCard((current) => !current)}>{showCard ? '숨기기' : '보기'}</button><button className="sheet-action" onClick={enableSms}>SMS 수신 사용</button>{import.meta.env.VITE_ENABLE_TEST_TOOLS === 'true' && <section className="test-tools"><h3>개발 테스트</h3><p>문자가 없어도 승인 처리와 자동 분류를 확인합니다. 경고는 정주비·학습공간비 각각의 사용률을 기준으로 판정합니다.</p><button className="sheet-action secondary-action" onClick={() => void injectTestApproval()}>테스트 승인 SMS 주입</button><button className="sheet-action secondary-action" onClick={() => void scheduleTestApproval()}>10초 뒤 테스트 승인</button><button className="sheet-action secondary-action" onClick={() => void sendTestNotification()}>테스트 알림 보내기</button></section>}<button className="sheet-action secondary-action" onClick={() => void enableNotifications()}>예산 경고 알림 사용</button><label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max={second - 1} value={first} onChange={(event) => updateAlertThreshold(0, +event.target.value)} /></label><label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min={first + 1} max="99" value={second} onChange={(event) => updateAlertThreshold(1, +event.target.value)} /></label><section className="policy-card"><h3>계획표 붙여넣기</h3><p>모바일 웹에서 계획표를 복사해 붙여넣으세요. 자동 확정하지 않으며, 아래 결과를 검토한 뒤 적용합니다.</p><textarea aria-label="계획표 내용" value={policyText} onChange={(event) => setPolicyText(event.target.value)} placeholder="예: 숙박비 50,000원 · 식비 200,000원 · 교통비 250,000원 · 카페 200,000원" /><button className="sheet-action" onClick={reviewPolicyText}>계획표 읽기</button><button className="sheet-action secondary-action" onClick={() => void readPolicyScreenshot()}>스크린샷에서 읽기</button>{policyDraft && <div className="policy-preview"><strong>검토 결과</strong><div className="policy-lines"><section className="policy-group"><h4>정주비 <span>{won(getPolicyLimit(policyDraft, 'resident'))}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'resident').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={policyDraft.plans[item.key]} onChange={(event) => updatePolicyDraft(item.key, event.target.value)} /></label>)}</section><section className="policy-group"><h4>학습공간비 <span>{won(getPolicyLimit(policyDraft, 'studySpace'))}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'studySpace').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={policyDraft.plans[item.key]} onChange={(event) => updatePolicyDraft(item.key, event.target.value)} /></label>)}</section><strong>총 한도 {won(getPolicyLimit(policyDraft, 'resident') + getPolicyLimit(policyDraft, 'studySpace'))}</strong></div><button className="sheet-action" onClick={confirmPolicy}>검토 후 정책 확정</button></div>}</section><BackupRestore ledger={ledger} policyBook={policyBook} onRestore={restoreBackup} notify={show} /><section className="import-card"><h3>데이터 가져오기</h3><p>신한카드 엑셀(.xls/.xlsx) 또는 신한은행 거래내역 PDF를 읽습니다. PDF 비밀번호는 저장하거나 외부로 전송하지 않습니다.</p><label className="file-picker">엑셀 또는 PDF 파일 선택<input aria-label="거래내역 파일" type="file" accept=".xls,.xlsx,.pdf,application/pdf" onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportTransactions(null); setImportResult(null); setImportSafety(null); setImportPassword(''); }} /></label>{importFile && <div className="import-preview"><strong>{importFile.name}</strong>{importFile.name.toLowerCase().endsWith('.pdf') && <label>PDF 비밀번호<input aria-label="PDF 비밀번호" type="password" inputMode="numeric" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} /></label>}<button className="sheet-action" onClick={() => void previewImportFile()}>파일 읽기</button></div>}{importTransactions && <div className="import-preview">{importSafety?.hasMaskedCardWarning && <p className="import-warning">카드 번호가 일부 가려져 있습니다. 설정 카드 기준으로 일치하는 내역만 가져옵니다.</p>}<strong>{importTransactions.length}건 확인</strong><span>가져오기 전 분류 결과를 적용합니다. 은행 PDF는 체크카드 출금만 가져옵니다.</span><button className="sheet-action" onClick={applyCardExport}>내역 가져오기</button></div>}{importResult && <p className="success">신규 {importResult.imported}건 · 중복 {importResult.duplicates}건 · 제외 {importResult.excluded}건 · 미정 {importResult.undecided}건</p>}</section></>;
  else content = <><p>수신된 승인 문자를 확인하고 분류합니다.</p><div className="item"><strong>{payment.merchant}</strong><span>{payment.occurredAt.slice(0, 10)} · {won(payment.amount)}</span></div><p className="prediction">자동 분류: <strong>{classificationText(classifyPayment(payment.merchant, payment.amount))}</strong></p><div className="choices"><button onClick={saveUndecided}>미정으로 저장</button><button aria-label="자동 분류 적용" onClick={applyAutomatic}>자동 분류 적용</button></div></>;

  const title = panel === 'resident' ? '정주비 상세' : panel === 'study' ? '학습공간비 상세' : panel === 'undecided' ? '미정 지출' : panel === 'recent' ? '최근 결제' : panel === 'cancel' ? '취소 확인' : panel === 'settings' ? '설정' : panel === 'evidence' ? '증빙 PDF 만들기' : '새 결제 확인';
  if (!activePolicy.confirmed) return <OnboardingFlow onComplete={completeOnboarding} />;

  return <main className="app"><header><h1>지원금 관리</h1><button aria-label="설정 열기" onClick={openSettings}><GearSix size={39} /></button></header><section className="summary"><div className="summary-heading"><p>총 잔액</p><button className="new-payment" aria-label="새 결제 확인" onClick={openPayment}><Plus size={16} weight="bold" />새 결제</button></div><strong>{won(totalLimit - totalSpent)}</strong><span>{won(totalLimit)} 중 {won(totalSpent)} 사용 · {totalUsage.toFixed(1)}%</span><i><b style={{ width: `${totalUsage}%` }} /></i></section><section className="budgets"><Budget name="정주비" remaining={resident.remaining} usage={resident.usagePercent} open={() => setPanel('resident')} /><Budget name="학습공간비" remaining={study.remaining} usage={study.usagePercent} open={() => setPanel('study')} /></section><section className="quick"><h2>빠른 확인</h2><button aria-label={`미정 지출 ${undecidedCount}건`} onClick={() => setPanel('undecided')}><i><ChatCircleDots size={29} /></i><span>미정 지출</span>{undecidedCount > 0 && <b className="undecided-badge" aria-hidden="true">{undecidedCount > 9 ? '9+' : undecidedCount}</b>}<CaretRight size={25} /></button><button onClick={() => setPanel('recent')}><i><ListBullets size={29} /></i>최근 결제 보기<CaretRight size={25} /></button><button onClick={() => setPanel('evidence')}><i><ListBullets size={29} /></i>증빙 PDF 만들기<CaretRight size={25} /></button></section>{panel && <BottomSheet title={title} onClose={close}>{content}</BottomSheet>}<Toast message={toast} /></main>;
}
export default App;
