import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CaretRight, ChatCircleDots, GearSix, ListBullets } from '@phosphor-icons/react';
import { BottomSheet } from './components/BottomSheet';
import { Toast } from './components/Toast';
import { BUDGET_LIMITS, type BudgetKey } from './domain/budget';
import { applyPayment, createEmptyLedger, createInitialLedger, getSummary, importCardTransactions, loadLedger, saveAsUndecided, saveLedger, type ImportResult, type Ledger } from './domain/ledger';
import { parseShinhanCardExport, type ImportedCardTransaction } from './domain/shinhanImport';
import { classifyPayment, type PaymentClassification } from './domain/sms';
import { SmsBridge, type NativeApproval } from './native/smsBridge';
import './App.css';

type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'settings' | 'payment' | null;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const defaultPayment: NativeApproval = { cardLast4: '', occurredAt: '2026-07-24T17:58:00+09:00', amount: 8000, merchant: '삼성웰스토리(주)크래프톤정' };
const categoryNames = { lodging: '숙박비', food: '식비', transport: '교통비', generalCafe: '일반카페' };
const planned: Record<BudgetKey, Array<[keyof typeof categoryNames, number]>> = {
  resident: [['lodging', 50000], ['food', 200000], ['transport', 250000]],
  studySpace: [['generalCafe', 200000]],
};

function classificationText(result: PaymentClassification) {
  if (result.status === 'excluded') return '제외 대상으로 분류';
  if (result.status === 'undecided') return '미정 — 직접 분류가 필요';
  return `${result.bucket === 'resident' ? '정주비' : '학습공간 지원비'} · ${categoryNames[result.category]}`;
}
function Budget({ name, remaining, usage, open }: { name: string; remaining: number; usage: number; open: () => void }) {
  return <button className="budget" onClick={open} aria-label={`${name} 상세 보기`}><span><strong>{name}</strong><em>잔액 {won(remaining)}</em><CaretRight size={27} weight="bold" /></span><i><b style={{ width: `${Math.min(100, usage)}%` }} /></i><small>{usage.toFixed(1)}% 사용</small></button>;
}
function Table({ rows }: { rows: Array<[string, number, number]> }) {
  return <div className="table"><div><span>항목</span><span>계획</span><span>사용</span><span>잔액</span></div>{rows.map(([name, plan, used]) => <div key={name}><strong>{name}</strong><span>{won(plan)}</span><span>{won(used)}</span><span>{won(plan - used)}</span></div>)}</div>;
}
function App() {
  const [panel, setPanel] = useState<Panel>(null);
  const [first, setFirst] = useState(50);
  const [second, setSecond] = useState(80);
  const [card, setCard] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [payment, setPayment] = useState<NativeApproval>(defaultPayment);
  const [ledger, setLedger] = useState<Ledger>(() => loadLedger(window.localStorage, import.meta.env.PROD ? createEmptyLedger : createInitialLedger));
  const [importTransactions, setImportTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const close = () => setPanel(null);
  const show = (message: string) => { setToast(message); window.setTimeout(() => setToast(null), 3200); };
  useEffect(() => { saveLedger(window.localStorage, ledger); }, [ledger]);

  const resident = getSummary(ledger, 'resident');
  const study = getSummary(ledger, 'studySpace');
  const totalSpent = resident.spent + study.spent;
  const totalLimit = BUDGET_LIMITS.resident + BUDGET_LIMITS.studySpace;
  const totalUsage = (totalSpent / totalLimit) * 100;
  const rowsFor = (bucket: BudgetKey): Array<[string, number, number]> => planned[bucket].map(([category, limit]) => [categoryNames[category], limit, ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && entry.category === category).reduce((sum, entry) => sum + entry.amount, 0)]);
  const undecidedCount = ledger.entries.filter((entry) => entry.status === 'undecided').length;
  const recent = useMemo(() => ledger.entries.filter((entry) => entry.status === 'classified').slice(-3).reverse(), [ledger.entries]);

  const enableSms = async () => {
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
  const openPayment = async () => {
    try { const result = await SmsBridge.consumePendingApprovals(); if (result.items[0]) setPayment(result.items[0]); }
    catch { /* Browser preview uses the sample payment. */ }
    setPanel('payment');
  };
  const applyAutomatic = () => {
    const result = applyPayment(ledger, payment);
    setLedger(result.ledger);
    const alert = result.alerts.length ? ` · ${result.alerts.map((threshold) => `${threshold}% 경고`).join(', ')}` : '';
    close(); show(`${classificationText(classifyPayment(payment.merchant, payment.amount))}로 저장했습니다.${alert}`);
  };
  const saveUndecided = () => { const result = saveAsUndecided(ledger, payment); setLedger(result.ledger); close(); show('미정 지출로 저장했습니다.'); };

  let content: ReactNode;
  if (panel === 'resident') content = <Table rows={rowsFor('resident')} />;
  else if (panel === 'study') content = <Table rows={rowsFor('studySpace')} />;
  else if (panel === 'undecided') content = undecidedCount ? <>{ledger.entries.filter((entry) => entry.status === 'undecided').map((entry) => <div className="item" key={entry.id}><strong>{entry.merchant}</strong><span>{won(entry.amount)}</span></div>)}</> : <p>미정으로 보관된 지출이 없습니다.</p>;
  else if (panel === 'recent') content = recent.length ? <>{recent.map((entry) => <div className="item" key={entry.id}><strong>{entry.merchant} · {entry.category ? categoryNames[entry.category as keyof typeof categoryNames] : ''}</strong><span>{won(entry.amount)}</span></div>)}</> : <p>저장된 결제가 없습니다.</p>;
  else if (panel === 'settings') content = <><p>카드 끝 4자리가 일치하는 신한 체크 승인 문자만 처리합니다.</p><label>카드 끝 4자리<input aria-label="카드 끝 4자리" inputMode="numeric" maxLength={4} value={card} onChange={(event) => setCard(event.target.value.replace(/\D/g, ''))} /></label><button className="sheet-action" onClick={enableSms}>SMS 수신 사용</button><label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max="99" value={first} onChange={(event) => setFirst(+event.target.value)} /></label><label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min="1" max="99" value={second} onChange={(event) => setSecond(+event.target.value)} /></label><section className="import-card"><h3>사용 내역 가져오기</h3><p>신한카드 앱에서 내려받은 .xls 또는 .xlsx 파일을 읽습니다. 첫 가져오기는 데모 내역을 실제 내역으로 교체하며, 이후에는 승인번호로 중복을 제외합니다.</p><label className="file-picker">엑셀 파일 선택<input aria-label="신한카드 엑셀 파일" type="file" accept=".xls,.xlsx" onChange={(event) => void previewCardExport(event.target.files?.[0])} /></label>{importTransactions && <div className="import-preview"><strong>{importTransactions.length}건 확인</strong><span>가져오기 전 분류 결과를 적용합니다.</span><button className="sheet-action" onClick={applyCardExport}>내역 가져오기</button></div>}{importResult && <p className="success">신규 {importResult.imported}건 · 중복 {importResult.duplicates}건 · 제외 {importResult.excluded}건 · 미정 {importResult.undecided}건</p>}</section></>;
  else content = <><p>수신된 승인 문자를 확인하고 분류합니다.</p><div className="item"><strong>{payment.merchant}</strong><span>{payment.occurredAt.slice(0, 10)} · {won(payment.amount)}</span></div><p className="prediction">자동 분류: <strong>{classificationText(classifyPayment(payment.merchant, payment.amount))}</strong></p><div className="choices"><button onClick={saveUndecided}>미정으로 저장</button><button aria-label="자동 분류 적용" onClick={applyAutomatic}>자동 분류 적용</button></div></>;

  const title = panel === 'resident' ? '정주비 상세' : panel === 'study' ? '학습공간 지원비 상세' : panel === 'undecided' ? '미정 지출' : panel === 'recent' ? '최근 결제' : panel === 'settings' ? '설정' : '새 결제 확인';
  return <main className="app"><header><h1>지원금 관리</h1><button aria-label="설정 열기" onClick={() => setPanel('settings')}><GearSix size={39} /></button></header><section className="summary"><p>총 잔액</p><strong>{won(totalLimit - totalSpent)}</strong><span>{won(totalLimit)} 중 {won(totalSpent)} 사용 · {totalUsage.toFixed(1)}%</span><i><b style={{ width: `${totalUsage}%` }} /></i></section><section className="budgets"><Budget name="정주비" remaining={resident.remaining} usage={resident.usagePercent} open={() => setPanel('resident')} /><Budget name="학습공간 지원비" remaining={study.remaining} usage={study.usagePercent} open={() => setPanel('study')} /></section><section className="quick"><h2>빠른 확인</h2><button onClick={() => setPanel('undecided')}><i><ChatCircleDots size={29} /></i>미정 지출 {undecidedCount}건<CaretRight size={25} /></button><button onClick={() => setPanel('recent')}><i><ListBullets size={29} /></i>최근 결제 보기<CaretRight size={25} /></button></section><button className="primary" onClick={openPayment}>새 결제 확인</button>{panel && <BottomSheet title={title} onClose={close}>{content}</BottomSheet>}<Toast message={toast} /></main>;
}
export default App;