import { describe, expect, it } from 'vitest';
import { findAutomaticReceiptMatch, parseReceiptOcr } from './receiptOcr';

describe('receipt OCR extraction', () => {
  it('extracts a labelled total and an explicit receipt date', () => {
    expect(parseReceiptOcr('2026.09.20\n결제금액: 12,300원')).toEqual({ date: '2026-09-20', amount: 12300 });
  });

  it('only auto-links an unambiguous same-day same-amount payment', () => {
    const details = { date: '2026-09-20', amount: 12000 };
    expect(findAutomaticReceiptMatch(details, [{ id: 'one', occurredAt: '2026-09-20T12:00:00+09:00', amount: 12000, merchant: '카페' }])?.id).toBe('one');
    expect(findAutomaticReceiptMatch(details, [
      { id: 'one', occurredAt: '2026-09-20T12:00:00+09:00', amount: 12000, merchant: '카페' },
      { id: 'two', occurredAt: '2026-09-20T13:00:00+09:00', amount: 12000, merchant: '식당' },
    ])).toBeNull();
  });
});
