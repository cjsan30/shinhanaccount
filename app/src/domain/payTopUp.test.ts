import { describe, expect, it } from 'vitest';
import { payTopUpMerchant, topUpEntries, type AccountWithdrawal } from './payTopUp';

const withdrawal = (patch: Partial<AccountWithdrawal> = {}): AccountWithdrawal => ({
  id: 'notification-abc', accountLast4: '1234', occurredAt: '2026-11-25T19:46:00+09:00', amount: 10000, counterparty: '카카오페이 입출금', ...patch,
});

describe('pay top-up withdrawals', () => {
  it('names the pay service of a top-up counterparty', () => {
    expect(payTopUpMerchant('카카오페이 입출금')).toBe('카카오페이 충전');
    expect(payTopUpMerchant('네이버파이낸셜')).toBe('네이버페이 충전');
    expect(payTopUpMerchant('토스 충전')).toBe('토스 충전');
    expect(payTopUpMerchant('PAYCO')).toBe('페이코 충전');
    expect(payTopUpMerchant('쿠팡 페이')).toBe('쿠팡페이 충전');
    expect(payTopUpMerchant('SSGPAY')).toBe('SSG페이 충전');
  });

  it('ignores withdrawals that are not a pay top-up', () => {
    expect(payTopUpMerchant('테스트 부동산 월세')).toBeNull();
    expect(topUpEntries([withdrawal({ counterparty: '홍길동' })])).toEqual([]);
  });

  it('keeps a top-up as an undecided payment with its bank origin', () => {
    const [entry] = topUpEntries([withdrawal()]);
    expect(entry).toMatchObject({
      id: 'topup-notification-abc', merchant: '카카오페이 충전', amount: 10000, status: 'undecided', source: 'notification', bankSummary: '카카오페이 입출금',
      importOrigins: [{ kind: 'bank', identifierLast4: '1234', merchant: '카카오페이 입출금', amount: 10000 }],
    });
    expect(entry.bucket).toBeUndefined();
    expect(entry.periodKey).toBeTruthy();
  });

  it('drops a broken withdrawal instead of guessing', () => {
    expect(topUpEntries([withdrawal({ amount: 0 }), withdrawal({ occurredAt: 'not a date' })])).toEqual([]);
  });
});
