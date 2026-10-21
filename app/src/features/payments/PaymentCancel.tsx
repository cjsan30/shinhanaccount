import { getRemainingPaymentAmount, type LedgerEntry } from '../../domain/ledger';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

type Props = {
  entry: LedgerEntry | null;
  amount: string;
  onAmountChange: (value: string) => void;
  onConfirm: () => void;
};

export function PaymentCancel({ entry, amount, onAmountChange, onConfirm }: Props) {
  if (!entry) return <p>확인할 결제가 없습니다.</p>;
  const remaining = getRemainingPaymentAmount(entry);
  return <>
    <p>실제 취소가 확인된 경우에만 금액을 확인하세요. 일부만 취소된 경우에는 취소된 금액만 입력합니다.</p>
    <div className="item"><strong>{entry.merchant}</strong><span>원결제 {won(entry.amount)} · 남은 결제 {won(remaining)}</span></div>
    <label>취소 금액<input aria-label="취소 금액" type="number" inputMode="numeric" min="1" max={remaining} value={amount} onChange={(event) => onAmountChange(event.target.value)} /></label>
    <button className="sheet-action danger-action" onClick={onConfirm}>{Number(amount) === remaining ? '전체 취소 확정' : '부분 취소 확정'}</button>
  </>;
}
