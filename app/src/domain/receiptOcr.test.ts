import { describe, expect, it } from 'vitest';
import { findAutomaticReceiptMatch, parseReceiptOcr } from './receiptOcr';

describe('receipt OCR extraction', () => {
  it('extracts a labelled total and an explicit receipt date', () => {
    expect(parseReceiptOcr('2026.09.20\n결제금액: 12,300원')).toEqual({ date: '2026-09-20', amount: 12300 });
  });

  it('extracts Korean and space-separated receipt dates', () => {
    expect(parseReceiptOcr('2026년 9월 28일\n결제 합계 2,700원')).toEqual({ date: '2026-09-28', amount: 2700 });
    expect(parseReceiptOcr('09 28\n승인 금액: 1,230원', 2026)).toEqual({ date: '2026-09-28', amount: 1230 });
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
