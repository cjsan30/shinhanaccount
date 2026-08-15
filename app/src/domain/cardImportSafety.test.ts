import { describe, expect, it } from 'vitest';
import { filterTransactionsForConfiguredCard } from './cardImportSafety';
import type { ImportedCardTransaction } from './shinhanImport';

const transaction = (cardMasked: string, approvalNumber: string, cardIdentity?: string): ImportedCardTransaction => ({
  occurredAt: '2026-08-05T12:00:00+09:00', cardMasked, cardIdentity, merchant: 'Cafe', approvalNumber, amount: 5000, paymentStatus: '승인', cancellationStatus: '', classification: { status: 'undecided' },
});

describe('card import safety', () => {
  it('keeps only rows whose masked prefix matches the configured card', () => {
    const result = filterTransactionsForConfiguredCard([transaction('111*', '1'), transaction('222*', '2'), transaction('112*', '3')], '1111');
    expect(result).toMatchObject({ status: 'ready', skippedOtherCards: 2, hasMaskedCardWarning: true });
    expect(result.transactions.map((item) => item.approvalNumber)).toEqual(['1']);
  });
  it('rejects multiple identifiable cards sharing the configured masked prefix', () => {
    const result = filterTransactionsForConfiguredCard([transaction('111*', '1', 'card-A'), transaction('111*', '2', 'card-B')], '1111');
    expect(result).toMatchObject({ status: 'rejected', reason: 'ambiguous-card-identity' });
  });
  it('rejects a file without the configured card prefix', () => {
    const result = filterTransactionsForConfiguredCard([transaction('222*', '2')], '1111');
    expect(result).toMatchObject({ status: 'rejected', reason: 'no-matching-card' });
  });
});