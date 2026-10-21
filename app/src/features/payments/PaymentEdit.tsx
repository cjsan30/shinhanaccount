import type { BudgetKey } from '../../domain/budget';
import type { LedgerEntry } from '../../domain/ledger';
import { POLICY_ITEMS } from '../../domain/policy';

type Props = {
  entry: LedgerEntry | null;
  onSave: (bucket: BudgetKey, category: string) => void;
};

export function PaymentEdit({ entry, onSave }: Props) {
  if (!entry) return <p>수정할 결제가 없습니다.</p>;
  // The caller reads the other fields by id when saving, so the ids are part of the contract.
  const save = () => {
    const item = POLICY_ITEMS.find((candidate) => candidate.key === (document.getElementById('edit-category') as HTMLSelectElement | null)?.value);
    if (item) onSave(item.bucket, item.ledgerCategories[0]);
  };
  return <>
    <p>수정한 내역은 수동 입력 내역으로 기록됩니다.</p>
    <label>결제일시<input id="edit-occurred-at" aria-label="수정 결제일시" type="datetime-local" defaultValue={entry.occurredAt.slice(0, 16)} /></label>
    <label>상호명<input id="edit-merchant" aria-label="수정 상호명" defaultValue={entry.merchant} /></label>
    <label>금액<input id="edit-amount" aria-label="수정 금액" type="number" inputMode="numeric" min="1" defaultValue={entry.amount} /></label>
    <label>분류<select id="edit-category" aria-label="수정 분류" defaultValue={POLICY_ITEMS.find((item) => item.ledgerCategories.includes(String(entry.category)))?.key ?? 'food'}>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label>
    <label>메모 (선택)<input id="edit-memo" aria-label="결제 메모" defaultValue={entry.memo ?? ''} placeholder="예: 스터디 모임" maxLength={80} /></label>
    <button className="sheet-action" onClick={save}>수정 저장</button>
  </>;
}
