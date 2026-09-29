import { describe, expect, it } from 'vitest';
import { findReceiptCandidates } from './receiptMatching';

const payment = { id: 'payment-1', occurredAt: '2026-09-29T23:20:00+09:00', amount: 5000, merchant: '메가커피 김포점' };

describe('receipt matching', () => {
  it('prioritizes same-date and same-amount matches', () => {
    expect(findReceiptCandidates({ date: '2026-09-29', amount: 5000, merchant: '메가커피' }, [payment])[0]).toMatchObject({ payment: { id: 'payment-1' }, score: 10 });
  });
  it('allows only a short midnight-boundary next-day candidate', () => {
    expect(findReceiptCandidates({ date: '2026-09-30', amount: 5000 }, [payment])).toHaveLength(1);
    expect(findReceiptCandidates({ date: '2026-10-01', amount: 5000 }, [payment])).toHaveLength(0);
  });
  it('does not suggest a match when date or amount is unknown', () => {
    expect(findReceiptCandidates({ date: '2026-09-29' }, [payment])).toEqual([]);
  });
});
