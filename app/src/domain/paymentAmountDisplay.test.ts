import { describe, expect, it } from 'vitest';
import { getPaymentAmountDisplay } from './paymentAmountDisplay';
import type { LedgerEntry } from './ledger';

const entry: LedgerEntry = { id: 'amount', merchant: '검증 결제', cardLast4: '1234', occurredAt: '2026-10-09T12:00:00+09:00', amount: 50000, status: 'undecided' };

describe('payment amount presentation', () => {
  it.each([undefined, 50000])('shows only the original amount for full support %s', (supportAmount) => {
    expect(getPaymentAmountDisplay({ ...entry, supportAmount })).toEqual({ isPortion: false, primaryAmount: 50000 });
  });
  it.each(['undecided', 'classified'] as const)('emphasizes a saved portion for %s without changing the original', (status) => {
    const original = Object.freeze({ ...entry, status, supportAmount: 30000 });
    expect(getPaymentAmountDisplay(original)).toEqual({ isPortion: true, primaryAmount: 30000 });
    expect(original.amount).toBe(50000);
  });
  it.each([
    { status: 'cancelled' as const }, { status: 'excluded' as const },
    { supportAmountReviewRequired: true }, { duplicateCandidateIds: ['old'] },
    { supportAmount: 0 }, { supportAmount: -1 }, { supportAmount: Number.NaN },
  ])('does not imply a confirmed positive portion for an exceptional state %j', (patch) => {
    expect(getPaymentAmountDisplay({ ...entry, supportAmount: 30000, ...patch })).toEqual({ isPortion: false, primaryAmount: 50000 });
  });
  it('shows the reconfirmed amount limited to the remaining payment after cancellation', () => {
    expect(getPaymentAmountDisplay({ ...entry, cancelledAmount: 35000, supportAmount: 30000 })).toEqual({ isPortion: true, primaryAmount: 15000 });
  });
});
