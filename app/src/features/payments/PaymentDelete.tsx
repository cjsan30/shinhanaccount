import type { LedgerEntry } from '../../domain/ledger';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

type Props = { entry: LedgerEntry | null; onConfirm: () => void };

export function PaymentDelete({ entry, onConfirm }: Props) {
  if (!entry) return <p>삭제할 결제가 없습니다.</p>;
  return <>
    <p>삭제하면 이 앱의 결제 내역과 예산 사용액에서 제거됩니다. 카드사·은행 원본 내역은 삭제되지 않습니다.</p>
    <div className="item"><strong>{entry.merchant}</strong><span>{entry.occurredAt.slice(0, 10)} · {won(entry.amount)}</span></div>
    <button className="sheet-action danger-action" onClick={onConfirm}>결제 내역 삭제</button>
  </>;
}
