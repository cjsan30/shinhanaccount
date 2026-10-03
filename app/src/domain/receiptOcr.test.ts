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

  it('uses a final payment label even when the receipt has a larger subtotal', () => {
    const result = parseReceiptOcr('결제일시: 2026-09-26 15:09:57\n상품 합계 24,600\n결 제 금 액 18,000\n카드 승인금액 18,000');
    expect(result).toMatchObject({ date: '2026-09-26', amount: 18000 });
  });

  it('recovers an unlabeled total repeated in a scanned receipt', () => {
    const result = parseReceiptOcr('2026-09-24 01:14:46\n초과계금액 1,400\n승인금액 1,400\n부가세 127');
    expect(result).toMatchObject({ date: '2026-09-24', amount: 1400 });
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
