import { describe, expect, it } from 'vitest';
import { findReceiptCandidates, paymentDateInKorea } from './receiptMatching';

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
  it('does not treat an empty normalized OCR merchant as a merchant match', () => {
    expect(findReceiptCandidates({ date: '2026-09-29', amount: 5000, merchant: '㈜() *' }, [payment])[0]).toMatchObject({ score: 8, reason: '같은 날짜 · 금액 일치' });
  });
  it('uses the Korea calendar date when showing date-only receipt choices', () => {
    expect(paymentDateInKorea({ occurredAt: '2026-09-29T15:30:00.000Z' })).toBe('2026-09-30');
  });
});
