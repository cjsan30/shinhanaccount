import { findCancellationCandidates, getRemainingPaymentAmount, type Ledger, type LedgerEntry } from '../../domain/ledger';
import type { NativeCancellation } from '../../native/smsBridge';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

type Props = {
  ledger: Ledger;
  notices: NativeCancellation[];
  onConfirm: (notice: NativeCancellation, entry: LedgerEntry) => void;
};

export function CancellationReview({ ledger, notices, onConfirm }: Props) {
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
