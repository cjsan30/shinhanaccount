import type { BudgetKey } from '../../domain/budget';
import { findCancellationCandidates, getRemainingPaymentAmount, getSupportAmount, type Ledger, type LedgerEntry } from '../../domain/ledger';
import { POLICY_ITEMS } from '../../domain/policy';
import type { NativeCancellation } from '../../native/smsBridge';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

type PaymentDetailProps = {
  entry: LedgerEntry | null;
  merchantAlias: string | undefined;
  categoryNames: Record<string, string>;
  inActivePeriod: boolean;
  hasSuspectedDuplicate: boolean;
  onEdit: (entry: LedgerEntry) => void;
  onMarkUndecided: (entry: LedgerEntry) => void;
  onCancel: (entry: LedgerEntry) => void;
  onDelete: (entry: LedgerEntry) => void;
};

export function PaymentDetail({ entry, merchantAlias, categoryNames, inActivePeriod, hasSuspectedDuplicate, onEdit, onMarkUndecided, onCancel, onDelete }: PaymentDetailProps) {
  if (!entry) return <p>결제 내역을 찾지 못했습니다.</p>;
  return <section className="payment-detail">
    <div className="payment-detail__hero">
      <strong>{merchantAlias || entry.merchant}</strong>
      {merchantAlias && <small>원본 결제처 · {entry.merchant}</small>}
      <span>{new Date(entry.occurredAt).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })}</span>
      <b>{won(entry.amount)}</b>
      <small>지원금 반영 {won(getSupportAmount(entry))}</small>
      {entry.supportAmountReviewRequired && entry.status !== 'cancelled' && <p role="alert" className="import-warning">부분 취소 · 금액 재확인 필요<br />분류 필요로 되돌려 지원금 반영 금액과 분류를 다시 확인해 주세요. 다시 분류하기 전까지 기존 분류를 유지하며, 반영 금액은 남은 결제 금액을 넘지 않습니다.</p>}
      {entry.cancelledAmount ? <small>취소 {won(entry.cancelledAmount)} · 남은 결제 {won(getRemainingPaymentAmount(entry))}</small> : null}
      <small>{entry.status === 'cancelled' ? '취소됨' : entry.status === 'excluded' ? '사업 무관 제외' : `${entry.bucket === 'resident' ? '정주비' : '학습공간비'} · ${categoryNames[entry.category ?? ''] || '분류 없음'}`}</small>
      {!inActivePeriod && <p className="period-outside-note">현재 적용 기간 외 결제입니다. 보존되지만 예산·경고·위젯에는 반영되지 않습니다.</p>}
      {hasSuspectedDuplicate && <p className="duplicate-note">같은 상호명과 금액의 유사 결제가 있습니다. 실제 중복인지 확인해 주세요.</p>}
      {entry.memo && <p className="payment-memo">메모 · {entry.memo}</p>}
    </div>
    {entry.status === 'classified' && <div className="payment-detail__actions">
      <button className="sheet-action" onClick={() => onEdit(entry)}>수정 · 분류 변경</button>
      <button className="sheet-action secondary-action" onClick={() => onMarkUndecided(entry)}>분류 필요로 되돌리기</button>
      <button className="sheet-action secondary-action" onClick={() => onCancel(entry)}>취소 확인</button>
      <button className="sheet-action danger-action" onClick={() => onDelete(entry)}>삭제</button>
    </div>}
    {entry.status === 'excluded' && <div className="payment-detail__actions">
      <button className="sheet-action" onClick={() => onMarkUndecided(entry)}>분류 필요로 되돌리기</button>
      <button className="sheet-action danger-action" onClick={() => onDelete(entry)}>삭제</button>
    </div>}
  </section>;
}

type PaymentEditProps = {
  entry: LedgerEntry | null;
  onSave: (bucket: BudgetKey, category: string) => void;
};

export function PaymentEdit({ entry, onSave }: PaymentEditProps) {
  if (!entry) return <p>수정할 결제가 없습니다.</p>;
  // The caller reads the other fields by id when saving, so the ids are part of the contract.
  const save = () => {
    const item = POLICY_ITEMS.find((candidate) => candidate.key === (document.getElementById('edit-category') as HTMLSelectElement | null)?.value);
    if (item) onSave(item.bucket, item.ledgerCategories[0]);
  };
  return <>
    <p>수정한 내역은 수동 입력 내역으로 기록됩니다.</p>
    <label>결제일시<input id="edit-occurred-at" aria-label="수정 결제일시" type="datetime-local" onClick={(event) => event.currentTarget.showPicker?.()} defaultValue={entry.occurredAt.slice(0, 16)} /></label>
    <label>상호명<input id="edit-merchant" aria-label="수정 상호명" defaultValue={entry.merchant} /></label>
    <label>금액<input id="edit-amount" aria-label="수정 금액" type="number" inputMode="numeric" min="1" defaultValue={entry.amount} /></label>
    <label>분류<select id="edit-category" aria-label="수정 분류" defaultValue={POLICY_ITEMS.find((item) => item.ledgerCategories.includes(String(entry.category)))?.key ?? 'food'}>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label>
    <label>메모 (선택)<input id="edit-memo" aria-label="결제 메모" defaultValue={entry.memo ?? ''} placeholder="예: 스터디 모임" maxLength={80} /></label>
    <button className="sheet-action" onClick={save}>수정 저장</button>
  </>;
}

type PaymentDeleteProps = { entry: LedgerEntry | null; onConfirm: () => void };

export function PaymentDelete({ entry, onConfirm }: PaymentDeleteProps) {
  if (!entry) return <p>삭제할 결제가 없습니다.</p>;
  return <>
    <p>삭제하면 이 앱의 결제 내역과 예산 사용액에서 제거됩니다. 카드사·은행 원본 내역은 삭제되지 않습니다.</p>
    <div className="item"><strong>{entry.merchant}</strong><span>{entry.occurredAt.slice(0, 10)} · {won(entry.amount)}</span></div>
    <button className="sheet-action danger-action" onClick={onConfirm}>결제 내역 삭제</button>
  </>;
}

type PaymentCancelProps = {
  entry: LedgerEntry | null;
  amount: string;
  onAmountChange: (value: string) => void;
  onConfirm: () => void;
};

export function PaymentCancel({ entry, amount, onAmountChange, onConfirm }: PaymentCancelProps) {
  if (!entry) return <p>확인할 결제가 없습니다.</p>;
  const remaining = getRemainingPaymentAmount(entry);
  return <>
    <p>실제 취소가 확인된 경우에만 금액을 확인하세요. 일부만 취소된 경우에는 취소된 금액만 입력합니다.</p>
    <div className="item"><strong>{entry.merchant}</strong><span>원결제 {won(entry.amount)} · 남은 결제 {won(remaining)}</span></div>
    <label>취소 금액<input aria-label="취소 금액" type="number" inputMode="numeric" min="1" max={remaining} value={amount} onChange={(event) => onAmountChange(event.target.value)} /></label>
    <button className="sheet-action danger-action" onClick={onConfirm}>{Number(amount) === remaining ? '전체 취소 확정' : '부분 취소 확정'}</button>
  </>;
}

type CancellationReviewProps = {
  ledger: Ledger;
  notices: NativeCancellation[];
  onConfirm: (notice: NativeCancellation, entry: LedgerEntry) => void;
};

export function CancellationReview({ ledger, notices, onConfirm }: CancellationReviewProps) {
  if (!notices.length) return <p>확인할 취소 알림이 없습니다.</p>;
  return <section className="cancellation-review">
    <p>취소 알림과 정확히 일치하는 기존 결제를 하나로 정하지 못했습니다. 실제로 취소된 결제를 선택하세요. 선택 전에는 예산이 바뀌지 않습니다.</p>
    {notices.map((notice) => {
      const candidates = findCancellationCandidates(ledger, notice);
      return <article key={notice.id ?? `${notice.occurredAt}-${notice.amount}`}>
        <strong>{notice.merchant} · {won(notice.amount)}</strong>
        <small>취소 알림 {new Date(notice.occurredAt).toLocaleString('ko-KR')}</small>
        <div>
          {candidates.map(({ entry }) => <button key={entry.id} className="sheet-action secondary-action" onClick={() => onConfirm(notice, entry)}>{entry.merchant} · {entry.occurredAt.slice(0, 16).replace('T', ' ')} · {notice.amount === getRemainingPaymentAmount(entry) ? '전체 취소' : `부분 취소 ${won(notice.amount)}`}</button>)}
          {!candidates.length && <small>일치하는 결제가 없습니다. 카드사 내역을 확인한 뒤 결제 상세에서 직접 취소 처리할 수 있습니다.</small>}
        </div>
      </article>;
    })}
  </section>;
}
