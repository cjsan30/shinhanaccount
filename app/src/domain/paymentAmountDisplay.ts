import { getSupportAmount, type LedgerEntry } from './ledger';

// Presentation only: original transaction values remain authoritative for matching/cancellation.
export function getPaymentAmountDisplay(entry: LedgerEntry) {
  const supportAmount = getSupportAmount(entry);
  const isPortion = entry.status !== 'cancelled' && entry.status !== 'excluded'
    && !entry.supportAmountReviewRequired && !entry.duplicateCandidateIds?.length
    && entry.supportAmount !== undefined && supportAmount > 0 && supportAmount !== entry.amount;
  return { isPortion, primaryAmount: isPortion ? supportAmount : entry.amount };
}
