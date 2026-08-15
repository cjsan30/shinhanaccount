import type { ImportedCardTransaction } from './shinhanImport';

export type CardImportSafetyDecision = {
  status: 'ready' | 'rejected';
  transactions: ImportedCardTransaction[];
  skippedOtherCards: number;
  hasMaskedCardWarning: boolean;
  reason?: 'missing-card' | 'no-matching-card' | 'ambiguous-card-identity';
};

export function getMaskedCardPrefix(value: string): string | null {
  const matched = value.match(/(\d{3})\*/);
  return matched?.[1] ?? null;
}

export function filterTransactionsForConfiguredCard(transactions: ImportedCardTransaction[], cardLast4: string): CardImportSafetyDecision {
  if (!/^\d{4}$/.test(cardLast4)) return { status: 'rejected', transactions: [], skippedOtherCards: 0, hasMaskedCardWarning: false, reason: 'missing-card' };
  const expectedPrefix = cardLast4.slice(0, 3);
  const matching = transactions.filter((transaction) => getMaskedCardPrefix(transaction.cardMasked) === expectedPrefix);
  if (!matching.length) return { status: 'rejected', transactions: [], skippedOtherCards: transactions.length, hasMaskedCardWarning: false, reason: 'no-matching-card' };
  const identities = new Set(matching.map((transaction) => transaction.cardIdentity).filter((identity): identity is string => Boolean(identity)));
  if (identities.size > 1) return { status: 'rejected', transactions: [], skippedOtherCards: transactions.length - matching.length, hasMaskedCardWarning: false, reason: 'ambiguous-card-identity' };
  return { status: 'ready', transactions: matching, skippedOtherCards: transactions.length - matching.length, hasMaskedCardWarning: matching.some((transaction) => !transaction.cardIdentity) };
}