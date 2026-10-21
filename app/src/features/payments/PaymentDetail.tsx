import { getRemainingPaymentAmount, getSupportAmount, type LedgerEntry } from '../../domain/ledger';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

type Props = {
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

export function PaymentDetail({ entry, merchantAlias, categoryNames, inActivePeriod, hasSuspectedDuplicate, onEdit, onMarkUndecided, onCancel, onDelete }: Props) {
  if (!entry) return <p>결제 내역을 찾지 못했습니다.</p>;
  return <section className="payment-detail">
    <div className="payment-detail__hero">
      <strong>{merchantAlias || entry.merchant}</strong>
      {merchantAlias && <small>원본 결제처 · {entry.merchant}</small>}
      <span>{new Date(entry.occurredAt).toLocaleString('ko-KR', { dateStyle: 'long', timeStyle: 'short' })}</span>
      <b>{won(entry.amount)}</b>
      <small>지원금 반영 {won(getSupportAmount(entry))}</small>
      {entry.supportAmountReviewRequired && entry.status !== 'cancelled' && <p role="alert" className="import-warning">부분 취소 · 금액 재확인 필요<br />미정으로 되돌려 지원금 반영 금액과 분류를 다시 확인해 주세요. 다시 분류하기 전까지 기존 분류를 유지하며, 반영 금액은 남은 결제 금액을 넘지 않습니다.</p>}
      {entry.cancelledAmount ? <small>취소 {won(entry.cancelledAmount)} · 남은 결제 {won(getRemainingPaymentAmount(entry))}</small> : null}
      <small>{entry.status === 'cancelled' ? '취소됨' : entry.status === 'excluded' ? '사업 무관 제외' : `${entry.bucket === 'resident' ? '정주비' : '학습공간비'} · ${categoryNames[entry.category ?? ''] || '분류 없음'}`}</small>
      {!inActivePeriod && <p className="period-outside-note">현재 적용 기간 외 결제입니다. 보존되지만 예산·경고·위젯에는 반영되지 않습니다.</p>}
      {hasSuspectedDuplicate && <p className="duplicate-note">같은 상호명과 금액의 유사 결제가 있습니다. 실제 중복인지 확인해 주세요.</p>}
      {entry.memo && <p className="payment-memo">메모 · {entry.memo}</p>}
    </div>
    {entry.status === 'classified' && <div className="payment-detail__actions">
      <button className="sheet-action" onClick={() => onEdit(entry)}>수정 · 분류 변경</button>
      <button className="sheet-action secondary-action" onClick={() => onMarkUndecided(entry)}>미정으로 되돌리기</button>
      <button className="sheet-action secondary-action" onClick={() => onCancel(entry)}>취소 확인</button>
      <button className="sheet-action danger-action" onClick={() => onDelete(entry)}>삭제</button>
    </div>}
    {entry.status === 'excluded' && <div className="payment-detail__actions">
      <button className="sheet-action" onClick={() => onMarkUndecided(entry)}>미정으로 되돌리기</button>
      <button className="sheet-action danger-action" onClick={() => onDelete(entry)}>삭제</button>
    </div>}
  </section>;
}
