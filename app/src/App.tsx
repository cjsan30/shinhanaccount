import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CaretRight, ChatCircleDots, GearSix, ListBullets } from '@phosphor-icons/react';
import { BottomSheet } from './components/BottomSheet';
import { Toast } from './components/Toast';
import { type BudgetKey } from './domain/budget';
import { applyPayment, cancelPayment, createEmptyLedger, createInitialLedger, getSummary, importCardTransactions, loadLedger, reclassifyUndecided, saveAsUndecided, saveLedger, type ImportResult, type Ledger, type LedgerEntry } from './domain/ledger';
import { parseShinhanCardExport, type ImportedCardTransaction } from './domain/shinhanImport';
import { getPolicyLimit, loadPolicy, parsePolicyText, POLICY_ITEMS, savePolicy, type PolicyItem, type SupportPolicy } from './domain/policy';
import { classifyPayment, type PaymentClassification } from './domain/sms';
import { SmsBridge, type NativeApproval } from './native/smsBridge';
import { createTestApproval } from './native/testApproval';
import { PolicyOcr } from './native/policyOcr';
import { NotificationBridge } from './native/notificationBridge';
import './App.css';

type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'cancel' | 'settings' | 'payment' | null;
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
  const [toast, setToast] = useState<string | null>(null);
  const [payment, setPayment] = useState<NativeApproval>(defaultPayment);
  const [ledger, setLedger] = useState<Ledger>(() => loadLedger(window.localStorage, import.meta.env.PROD ? createEmptyLedger : createInitialLedger));
  const [importTransactions, setImportTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [policy, setPolicy] = useState<SupportPolicy>(() => loadPolicy(window.localStorage));
  const [policyText, setPolicyText] = useState('');
  const [policyDraft, setPolicyDraft] = useState<SupportPolicy | null>(null);
  const [cancellationTarget, setCancellationTarget] = useState<LedgerEntry | null>(null);
  const close = () => setPanel(null);
  const show = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };
  useEffect(() => { saveLedger(window.localStorage, ledger); }, [ledger]);
  useEffect(() => { savePolicy(window.localStorage, policy); }, [policy]);

  const budgetLimits = { resident: getPolicyLimit(policy, 'resident'), studySpace: getPolicyLimit(policy, 'studySpace') };
  const [first, second] = ledger.alertThresholds;
  const resident = getSummary(ledger, 'resident', budgetLimits.resident);
  const study = getSummary(ledger, 'studySpace', budgetLimits.studySpace);
  const totalSpent = resident.spent + study.spent;
  const totalLimit = budgetLimits.resident + budgetLimits.studySpace;
  const totalUsage = (totalSpent / totalLimit) * 100;
  const rowsFor = (bucket: BudgetKey): Array<[string, number, number]> => POLICY_ITEMS.filter((item) => item.bucket === bucket).map((item) => [item.label, policy.plans[item.key], ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && item.ledgerCategories.includes(String(entry.category))).reduce((sum, entry) => sum + entry.amount, 0)]);
  const undecidedCount = ledger.entries.filter((entry) => entry.status === 'undecided').length;
  const recent = useMemo(() => ledger.entries.filter((entry) => entry.status === 'classified' || entry.status === 'cancelled').slice(-8).reverse(), [ledger.entries]);

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
  const sendBudgetAlerts = async (alerts: number[], bucket: BudgetKey) => {
    if (!alerts.length) return;
    try { await NotificationBridge.show({ title: '지원금 사용 경고', body: `${bucket === 'resident' ? '정주비' : '학습공간비'}가 ${alerts.map((value) => `${value}%`).join(', ')} 기준에 도달했습니다.` }); }
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
  const previewCardExport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const transactions = parseShinhanCardExport(await file.arrayBuffer());
      setImportTransactions(transactions);
      setImportResult(null);
      show(`${transactions.length}건의 카드 내역을 확인했습니다.`);
    } catch {
      setImportTransactions(null);
      show('신한카드 이용내역 파일 형식을 확인해 주세요.');
    }
  };
  const applyCardExport = () => {
    if (!importTransactions) return;
    const result = importCardTransactions(ledger, importTransactions);
    setLedger(result.ledger);
    setImportResult(result);
    setImportTransactions(null);
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
    setPolicy(policyDraft);
    setPolicyDraft(null);
    setPolicyText('');
    show('검토한 계획 금액을 정책에 적용했습니다.');
  };
  const openSettings = () => {
    setPolicyText(policy.sourceText);
    setPolicyDraft(structuredClone(policy));
    setPanel('settings');
  };
  const openPayment = async () => {
    try { const result = await SmsBridge.consumePendingApprovals(); if (result.items[0]) setPayment(result.items[0]); }
    catch { /* Browser preview uses the sample payment. */ }
    setPanel('payment');
  };
  const injectTestApproval = () => {
    setPayment(createTestApproval(card));
    setPanel('payment');
    show('테스트 승인 결제를 추가했습니다. 실제 SMS·카드 내역에는 저장되지 않습니다.');
  };
  const applyAutomatic = () => {
    const result = applyPayment(ledger, payment, budgetLimits);
    setLedger(result.ledger);
    void sendBudgetAlerts(result.alerts, result.entry.bucket ?? 'resident');
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
    const result = reclassifyUndecided(ledger, entryId, { bucket: item.bucket, category: item.ledgerCategories[0] }, budgetLimits);
    setLedger(result.ledger);
    void sendBudgetAlerts(result.alerts, item.bucket);
    const alert = result.alerts.length ? ` · ${result.alerts.map((threshold) => `${threshold}% 경고`).join(', ')}` : '';
    show(`${item.label}로 분류했습니다.${alert}`);
  };
  const saveUndecided = () => { const result = saveAsUndecided(ledger, payment); setLedger(result.ledger); close(); show('미정 지출로 저장했습니다.'); };

  let content: ReactNode;
  if (panel === 'resident') content = <Table rows={rowsFor('resident')} />;
  else if (panel === 'study') content = <Table rows={rowsFor('studySpace')} />;
  else if (panel === 'undecided') content = undecidedCount ? <>{ledger.entries.filter((entry) => entry.status === 'undecided').map((entry) => <section className="reclassify-card" key={entry.id}><div className="item"><strong>{entry.merchant}</strong><span>{entry.occurredAt.slice(0, 10)} · {won(entry.amount)}</span></div><p>지원 항목을 선택하면 즉시 예산에 반영됩니다.</p><div className="reclassify-options">{POLICY_ITEMS.map((item) => <button key={item.key} onClick={() => applyManualClassification(entry.id, item)}>{item.label}</button>)}</div></section>)}</> : <p>미정으로 보관된 지출이 없습니다.</p>;  else if (panel === 'recent') content = recent.length ? <>{recent.map((entry) => <section className="recent-card" key={entry.id}><div className="item"><strong>{entry.merchant} · {entry.status === 'cancelled' ? '취소됨' : categoryNames[entry.category ?? '']}</strong><span>{won(entry.amount)}</span></div>{entry.status === 'classified' && <button className="cancel-action" onClick={() => beginCancellation(entry)}>이 결제 취소 확인</button>}</section>)}</> : <p>저장된 결제가 없습니다.</p>;
  else if (panel === 'cancel') content = cancellationTarget ? <><p>실제 취소가 확인된 경우에만 확정하세요. 취소 확정 후에는 이 결제의 예산 사용액이 제외됩니다.</p><div className="item"><strong>{cancellationTarget.merchant}</strong><span>{cancellationTarget.occurredAt.slice(0, 10)} · {won(cancellationTarget.amount)}</span></div><button className="sheet-action danger-action" onClick={confirmCancellation}>취소 확정</button></> : <p>확인할 결제가 없습니다.</p>;  else if (panel === 'settings') content = <><p>카드 끝 4자리가 일치하는 신한 체크 승인 문자만 처리합니다.</p><label>카드 끝 4자리<input aria-label="카드 끝 4자리" inputMode="numeric" maxLength={4} value={card} onChange={(event) => setCard(event.target.value.replace(/\D/g, ''))} /></label><button className="sheet-action" onClick={enableSms}>SMS 수신 사용</button>{import.meta.env.VITE_ENABLE_TEST_TOOLS === 'true' && <section className="test-tools"><h3>개발 테스트</h3><p>문자가 없어도 승인 처리와 자동 분류를 확인합니다. 경고는 정주비·학습공간비 각각의 사용률을 기준으로 판정합니다.</p><button className="sheet-action secondary-action" onClick={injectTestApproval}>테스트 승인 SMS 주입</button><button className="sheet-action secondary-action" onClick={() => void sendTestNotification()}>테스트 알림 보내기</button></section>}<button className="sheet-action secondary-action" onClick={() => void enableNotifications()}>예산 경고 알림 사용</button><label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max={second - 1} value={first} onChange={(event) => updateAlertThreshold(0, +event.target.value)} /></label><label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min={first + 1} max="99" value={second} onChange={(event) => updateAlertThreshold(1, +event.target.value)} /></label><section className="policy-card"><h3>계획표 붙여넣기</h3><p>모바일 웹에서 계획표를 복사해 붙여넣으세요. 자동 확정하지 않으며, 아래 결과를 검토한 뒤 적용합니다.</p><textarea aria-label="계획표 내용" value={policyText} onChange={(event) => setPolicyText(event.target.value)} placeholder="예: 숙박비 50,000원 · 식비 200,000원 · 교통비 250,000원 · 카페 200,000원" /><button className="sheet-action" onClick={reviewPolicyText}>계획표 읽기</button><button className="sheet-action secondary-action" onClick={() => void readPolicyScreenshot()}>스크린샷에서 읽기</button>{policyDraft && <div className="policy-preview"><strong>검토 결과</strong><div className="policy-lines"><section className="policy-group"><h4>정주비 <span>{won(getPolicyLimit(policyDraft, 'resident'))}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'resident').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={policyDraft.plans[item.key]} onChange={(event) => updatePolicyDraft(item.key, event.target.value)} /></label>)}</section><section className="policy-group"><h4>학습공간비 <span>{won(getPolicyLimit(policyDraft, 'studySpace'))}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'studySpace').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={policyDraft.plans[item.key]} onChange={(event) => updatePolicyDraft(item.key, event.target.value)} /></label>)}</section><strong>총 한도 {won(getPolicyLimit(policyDraft, 'resident') + getPolicyLimit(policyDraft, 'studySpace'))}</strong></div><button className="sheet-action" onClick={confirmPolicy}>검토 후 정책 확정</button></div>}</section><section className="import-card"><h3>사용 내역 가져오기</h3><p>신한카드 앱에서 내려받은 .xls 또는 .xlsx 파일을 읽습니다. 첫 가져오기는 데모 내역을 실제 내역으로 교체하며, 이후에는 승인번호로 중복을 제외합니다.</p><label className="file-picker">엑셀 파일 선택<input aria-label="신한카드 엑셀 파일" type="file" accept=".xls,.xlsx" onChange={(event) => void previewCardExport(event.target.files?.[0])} /></label>{importTransactions && <div className="import-preview"><strong>{importTransactions.length}건 확인</strong><span>가져오기 전 분류 결과를 적용합니다.</span><button className="sheet-action" onClick={applyCardExport}>내역 가져오기</button></div>}{importResult && <p className="success">신규 {importResult.imported}건 · 중복 {importResult.duplicates}건 · 제외 {importResult.excluded}건 · 미정 {importResult.undecided}건</p>}</section></>;
  else content = <><p>수신된 승인 문자를 확인하고 분류합니다.</p><div className="item"><strong>{payment.merchant}</strong><span>{payment.occurredAt.slice(0, 10)} · {won(payment.amount)}</span></div><p className="prediction">자동 분류: <strong>{classificationText(classifyPayment(payment.merchant, payment.amount))}</strong></p><div className="choices"><button onClick={saveUndecided}>미정으로 저장</button><button aria-label="자동 분류 적용" onClick={applyAutomatic}>자동 분류 적용</button></div></>;

  const title = panel === 'resident' ? '정주비 상세' : panel === 'study' ? '학습공간비 상세' : panel === 'undecided' ? '미정 지출' : panel === 'recent' ? '최근 결제' : panel === 'cancel' ? '취소 확인' : panel === 'settings' ? '설정' : '새 결제 확인';
  return <main className="app"><header><h1>지원금 관리</h1><button aria-label="설정 열기" onClick={openSettings}><GearSix size={39} /></button></header><section className="summary"><p>총 잔액</p><strong>{won(totalLimit - totalSpent)}</strong><span>{won(totalLimit)} 중 {won(totalSpent)} 사용 · {totalUsage.toFixed(1)}%</span><i><b style={{ width: `${totalUsage}%` }} /></i></section><section className="budgets"><Budget name="정주비" remaining={resident.remaining} usage={resident.usagePercent} open={() => setPanel('resident')} /><Budget name="학습공간비" remaining={study.remaining} usage={study.usagePercent} open={() => setPanel('study')} /></section><section className="quick"><h2>빠른 확인</h2><button onClick={() => setPanel('undecided')}><i><ChatCircleDots size={29} /></i>미정 지출 {undecidedCount}건<CaretRight size={25} /></button><button onClick={() => setPanel('recent')}><i><ListBullets size={29} /></i>최근 결제 보기<CaretRight size={25} /></button></section><button className="primary" onClick={openPayment}>새 결제 확인</button>{panel && <BottomSheet title={title} onClose={close}>{content}</BottomSheet>}<Toast message={toast} /></main>;
}
export default App;