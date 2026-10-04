import type { ReceiptDetails, ReceiptMatchPayment } from './receiptMatching';

const cleanAmount = (value: string) => Number(value.replace(/[^0-9]/g, ''));

export function isValidReceiptDate(value: string | undefined): value is string {
  const match = value?.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function formatDate(year: string | undefined, month: string, day: string, fallbackYear: number) {
  const result = `${year ?? fallbackYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isValidReceiptDate(result) ? result : undefined;
}

function receiptDateFromText(text: string, fallbackYear: number) {
  const candidates = [...text.matchAll(/(?<!\d)(20\d{2})\s*(?:[./-]|년)\s*(\d{1,2})\s*(?:[./-]|월)\s*(\d{1,2})(?:\s*일)?/g)]
    .map((match) => {
      const date = formatDate(match[1], match[2], match[3], fallbackYear);
      const line = text.slice(text.lastIndexOf('\n', match.index) + 1, text.indexOf('\n', match.index) < 0 ? text.length : text.indexOf('\n', match.index));
      const nearby = text.slice(Math.max(0, (match.index ?? 0) - 24), (match.index ?? 0) + match[0].length + 24);
      const paymentLabel = /승\s*인\s*일\s*시|결\s*제\s*일\s*시|매\s*출\s*일|거\s*래\s*일\s*시|결\s*제\s*일/.test(nearby);
      const nonPaymentDate = /쿠폰|유효|행사|적립|발행|만료|기간/.test(line);
      return { date, score: paymentLabel ? 2 : nonPaymentDate ? -1 : 1 };
    })
    .filter((candidate): candidate is { date: string; score: number } => Boolean(candidate.date) && candidate.score >= 0)
    .sort((left, right) => right.score - left.score);
  if (candidates.length) return candidates[0].date;

  // Some receipt printers omit the year, but accept the abbreviated form only
  // when a payment-date label is present. This prevents barcode/order digits
  // from becoming a fabricated date.
  const labelledShort = text.match(/(?:승\s*인\s*일\s*시|결\s*제\s*일\s*시|매\s*출\s*일|거\s*래\s*일\s*시|결\s*제\s*일)[^\n\d]{0,12}(\d{1,2})\s*(?:[./-]|월|\s+)\s*(\d{1,2})(?:\s*일)?/);
  return labelledShort ? formatDate(undefined, labelledShort[1], labelledShort[2], fallbackYear) : undefined;
}

export function parseReceiptOcr(text: string, year = new Date().getFullYear()): ReceiptDetails {
  const normalized = text.replace(/\r/g, '\n');
  const date = receiptDateFromText(normalized, year);
  // ML Kit can omit the trailing "원" and add spaces between Korean glyphs.
  // Semantic labels are stronger evidence than a bare number: a subtotal can
  // exceed the final payment amount on a receipt.
  const labelled = [...normalized.matchAll(/(결\s*제\s*금\s*액|승\s*인\s*금\s*액|받\s*은\s*금\s*액|결\s*제\s*합\s*계|합\s*계\s*금\s*액|합\s*계|총\s*액)\s*[:：]?\s*([0-9][0-9,\s]{1,})/gi)]
    .map((match) => ({ value: cleanAmount(match[2]), priority: /결\s*제|승\s*인|받\s*은/i.test(match[1]) ? 2 : 1 }))
    .filter((candidate) => Number.isFinite(candidate.value) && candidate.value > 0 && candidate.value < 10_000_000);
  const bare = [...normalized.matchAll(/(?:^|[^0-9])([0-9]{1,3}(?:[ ,]\d{3})+|\d{4,6})(?!\d)/g)]
    .map((match) => cleanAmount(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 10_000_000);
  const frequent = [...bare.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<number, number>()).entries()]
    .sort((left, right) => right[1] - left[1] || right[0] - left[0])[0]?.[0];
  const amount = [...labelled].sort((left, right) => right.priority - left.priority).at(0)?.value ?? frequent;
  const merchantMatch = normalized.match(/(?:매장명|가맹점명|가맹점|판매영수증)\s*[:：]?\s*([^\n]{2,48})/i);
  const merchant = merchantMatch?.[1].replace(/[|]/g, ' ').replace(/\s+/g, ' ').trim();
  return { ...(date ? { date } : {}), ...(amount ? { amount } : {}), ...(merchant ? { merchant } : {}) };
}

/** Never selects between equal candidates: ambiguity always remains for the user. */
export function findAutomaticReceiptMatch(details: ReceiptDetails, payments: ReceiptMatchPayment[]) {
  if (!details.date || !details.amount) return null;
  const matches = payments.filter((payment) => payment.amount === details.amount && payment.occurredAt.slice(0, 10) === details.date);
  return matches.length === 1 ? matches[0] : null;
}
