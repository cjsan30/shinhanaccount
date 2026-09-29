export type ReceiptMatchPayment = { id: string; occurredAt: string; amount: number; merchant: string };
export type ReceiptDetails = { date?: string; amount?: number; merchant?: string };
export type ReceiptCandidate = { payment: ReceiptMatchPayment; score: number; reason: string };

const koreanDate = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const normalized = (value = '') => value.toLowerCase().replace(/[\s().,㈜*]/g, '');

export function findReceiptCandidates(receipt: ReceiptDetails, payments: ReceiptMatchPayment[], midnightBoundaryHours = 3): ReceiptCandidate[] {
  if (!receipt.date || !receipt.amount || receipt.amount <= 0) return [];
  const receiptDay = koreanDate(`${receipt.date}T12:00:00+09:00`);
  return payments.flatMap((payment) => {
    if (payment.amount !== receipt.amount) return [];
    const paymentDay = koreanDate(payment.occurredAt); const difference = Math.abs(new Date(`${receiptDay}T12:00:00+09:00`).getTime() - new Date(`${paymentDay}T12:00:00+09:00`).getTime()) / 86_400_000;
    const nearMidnight = difference === 1 && Math.abs(new Date(payment.occurredAt).getTime() - new Date(`${receipt.date}T00:00:00+09:00`).getTime()) <= midnightBoundaryHours * 3_600_000;
    if (difference !== 0 && !nearMidnight) return [];
    const receiptMerchant = normalized(receipt.merchant);
    // A punctuation-only OCR result normalizes to an empty string. `includes('')`
    // is always true, so require an actual merchant token before boosting a match.
    const merchantMatches = receiptMerchant.length > 0 && normalized(payment.merchant).includes(receiptMerchant);
    return [{ payment, score: (difference === 0 ? 8 : 4) + (merchantMatches ? 2 : 0), reason: `${difference === 0 ? '같은 날짜' : '자정 경계 날짜'} · 금액 일치${merchantMatches ? ' · 결제처 유사' : ''}` }];
  }).sort((left, right) => right.score - left.score || right.payment.occurredAt.localeCompare(left.payment.occurredAt));
}
