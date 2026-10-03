import type { ReceiptDetails, ReceiptMatchPayment } from './receiptMatching';

const cleanAmount = (value: string) => Number(value.replace(/[^0-9]/g, ''));

export function parseReceiptOcr(text: string, year = new Date().getFullYear()): ReceiptDetails {
  const normalized = text.replace(/\r/g, '\n');
  const dateMatch = normalized.match(/(?:(20\d{2})\s*(?:[./-]|년)\s*)?(\d{1,2})\s*(?:[./-]|월|\s+)\s*(\d{1,2})(?:\s*일)?/);
  const date = dateMatch ? `${dateMatch[1] ?? year}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}` : undefined;
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
