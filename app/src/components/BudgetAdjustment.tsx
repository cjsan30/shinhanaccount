import { useRef, useState } from 'react';
import type { BudgetKey } from '../domain/budget';
import { adjustBudget, type BudgetTransfer } from '../domain/budgetAdjustment';
import { getCategoryLimit, getPolicyItems, type SupportPolicy } from '../domain/policy';

type Props = {
  policy: SupportPolicy;
  spent: Readonly<Record<string, number>>;
  bucket?: BudgetKey;
  onApply: (transfer: BudgetTransfer) => Promise<void>;
};
const won = (amount: number) => `${amount.toLocaleString('ko-KR')}원`;

export function BudgetAdjustment({ policy, spent, bucket: initialBucket, onApply }: Props) {
  const [bucket, setBucket] = useState<BudgetKey>(initialBucket ?? 'resident');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amountText, setAmountText] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState('');
  const items = getPolicyItems(policy).filter((item) => item.bucket === bucket);
  const available = (key: string) => {
    const item = items.find((candidate) => candidate.key === key);
    return item ? Math.max(0, getCategoryLimit(policy, item.ledgerCategories[0]) - (spent[item.ledgerCategories[0]] ?? 0)) : 0;
  };
  const transfer = { from, to, amount: /^\d+$/.test(amountText) ? Number(amountText) : NaN };
  let adjusted: SupportPolicy | null = null;
  let issue = '';
  try { adjusted = adjustBudget(policy, transfer, spent); } catch (error) { issue = (error as Error).message; }
  const clearFeedback = () => setMessage('');
  const submit = async () => {
    if (submitting.current || !adjusted) return;
    submitting.current = true; setBusy(true); setMessage('');
    try {
      await onApply(transfer);
      setAmountText('');
      setMessage('예산을 조정했습니다. PDF에도 최종 계획 금액이 반영됩니다.');
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.'); }
    finally { submitting.current = false; setBusy(false); }
  };
  return <details className="data-section budget-adjustment">
    <summary><strong>예산 조정</strong><span>같은 대분류 안에서 이동</span></summary>
    <div className="data-section__body budget-adjustment__body">
      <p>이번 기간의 미사용 예산을 다른 세부 항목으로 옮깁니다. 실제 지출과 대분류 총액은 바뀌지 않습니다.</p>
      {!initialBucket && <label>대분류<select aria-label="예산 조정 대분류" value={bucket} disabled={busy} onChange={(event) => { setBucket(event.target.value as BudgetKey); setFrom(''); setTo(''); setAmountText(''); clearFeedback(); }}><option value="resident">정주비</option><option value="studySpace">학습공간비</option></select></label>}
      <label>가져올 항목<select aria-label="예산 가져올 항목" value={from} disabled={busy} onChange={(event) => { setFrom(event.target.value); if (event.target.value === to) setTo(''); clearFeedback(); }}><option value="">항목 선택</option>{items.map((item) => <option key={item.key} value={item.key} disabled={available(item.key) === 0}>{item.label} · 이동 가능 {won(available(item.key))}</option>)}</select></label>
      <label>받을 항목<select aria-label="예산 받을 항목" value={to} disabled={busy} onChange={(event) => { setTo(event.target.value); clearFeedback(); }}><option value="">항목 선택</option>{items.filter((item) => item.key !== from).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
      <label>이동 금액<input aria-label="예산 이동 금액" type="text" inputMode="numeric" autoComplete="off" value={amountText} disabled={busy} onChange={(event) => { setAmountText(event.target.value); clearFeedback(); }} placeholder="예: 50000" /></label>
      {from && <small>가져올 수 있는 금액: {won(available(from))}</small>}
      {adjusted && <div className="budget-adjustment__preview" aria-label="조정 후 계획">{items.filter((item) => item.key === from || item.key === to).map((item) => <p key={item.key}><strong>{item.label}</strong><span>{won(getCategoryLimit(policy, item.ledgerCategories[0]))} → {won(getCategoryLimit(adjusted!, item.ledgerCategories[0]))}</span></p>)}</div>}
      {from && to && amountText && issue && <p role="alert">{issue}</p>}
      <button className="sheet-action" type="button" disabled={busy || !adjusted} onClick={() => void submit()}>{busy ? '저장 중…' : '예산 조정 적용'}</button>
      {message && <p role="status">{message}</p>}
    </div>
  </details>;
}
