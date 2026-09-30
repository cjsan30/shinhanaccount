import type { ReceiptDetails, ReceiptMatchPayment } from './receiptMatching';

const cleanAmount = (value: string) => Number(value.replace(/[^0-9]/g, ''));

export function parseReceiptOcr(text: string, year = new Date().getFullYear()): ReceiptDetails {
  const normalized = text.replace(/\r/g, '\n');
  const dateMatch = normalized.match(/(?:(20\d{2})[./-]\s*)?(\d{1,2})[./-]\s*(\d{1,2})/);
  const date = dateMatch ? `${dateMatch[1] ?? year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : undefined;
  const labelled = [...normalized.matchAll(/(?:결제\s*금액|승인\s*금액|합계|총액|받을\s*금액|금액)\s*[:：]?\s*([0-9][0-9,]*)\s*원?/gi)].map((match) => cleanAmount(match[1]));
  const amounts = [...normalized.matchAll(/([0-9][0-9,]{2,})\s*원/g)].map((match) => cleanAmount(match[1]));
  const amount = [...labelled, ...amounts].filter((value) => Number.isFinite(value) && value > 0).at(-1);
  return { ...(date ? { date } : {}), ...(amount ? { amount } : {}) };
}

/** Never selects between equal candidates: ambiguity always remains for the user. */
export function findAutomaticReceiptMatch(details: ReceiptDetails, payments: ReceiptMatchPayment[]) {
  if (!details.date || !details.amount) return null;
  const matches = payments.filter((payment) => payment.amount === details.amount && payment.occurredAt.slice(0, 10) === details.date);
  return matches.length === 1 ? matches[0] : null;
}
