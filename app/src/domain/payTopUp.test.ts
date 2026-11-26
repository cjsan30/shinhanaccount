import { describe, expect, it } from 'vitest';
import { payTopUpMerchant, topUpEntries, type AccountWithdrawal } from './payTopUp';
import { createEmptyLedger, importBankTransactions } from './ledger';
import { reconcileImportedEntries } from './importReconciliation';
import type { ImportedBankTransaction } from './shinhanBankImport';

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

const statementRow = (patch: Partial<ImportedBankTransaction> = {}): ImportedBankTransaction => ({
  source: 'bankCsv', occurredAt: '2026-11-25T19:46:31+09:00', merchant: '카카오페이', summary: '모바일', amount: 10000, transactionId: 'row-1', direction: 'withdrawal', ...patch,
});
const withTopUps = (...items: AccountWithdrawal[]) => ({ ...createEmptyLedger(), entries: topUpEntries(items) });

describe('pay top-up and bank statement rows', () => {
  it('joins a statement row to the top-up notice within one minute', () => {
    const result = importBankTransactions(withTopUps(withdrawal()), [statementRow()], '1234');
    expect(result.ledger.entries).toHaveLength(1);
    expect(result.ledger.entries[0]).toMatchObject({ id: 'topup-notification-abc', merchant: '카카오페이 충전', status: 'undecided' });
    expect(result.ledger.entries[0].importOrigins).toHaveLength(2);
    expect(result.mergedUndecided).toBe(1);
    const again = importBankTransactions(result.ledger, [statementRow()], '1234');
    expect(again.ledger.entries).toHaveLength(1);
    expect(again.duplicates).toBe(1);
    expect(importBankTransactions(result.ledger, [statementRow({ transactionId: 'row-2', occurredAt: '2026-11-25T19:46:10+09:00' })], '1234').ledger.entries).toHaveLength(2);
  });

  it('keeps rows apart when they are more than one minute away or name another pay', () => {
    expect(importBankTransactions(withTopUps(withdrawal()), [statementRow({ occurredAt: '2026-11-25T19:47:01+09:00' })], '1234').ledger.entries).toHaveLength(2);
    expect(importBankTransactions(withTopUps(withdrawal()), [statementRow({ merchant: '토스', summary: '' })], '1234').ledger.entries).toHaveLength(2);
    expect(importBankTransactions(withTopUps(withdrawal()), [statementRow({ amount: 20000 })], '1234').ledger.entries).toHaveLength(2);
  });

  it('does not guess when two same top-ups fall within the minute', () => {
    const ledger = withTopUps(withdrawal(), withdrawal({ id: 'notification-def', occurredAt: '2026-11-25T19:47:00+09:00' }));
    expect(importBankTransactions(ledger, [statementRow({ occurredAt: '2026-11-25T19:46:40+09:00' })], '1234').ledger.entries).toHaveLength(3);
  });

  it('joins a notice that arrives after its statement row was imported', () => {
    const imported = importBankTransactions(createEmptyLedger(), [statementRow()], '1234').ledger;
    const joined = reconcileImportedEntries(imported.entries, topUpEntries([withdrawal()]));
    expect(joined.entries).toHaveLength(1);
    expect(joined.entries[0].merchant).toBe('카카오페이 충전');
    expect(joined.imported).toBe(0);
    expect(reconcileImportedEntries(joined.entries, topUpEntries([withdrawal()])).entries).toHaveLength(1);
    expect(reconcileImportedEntries(joined.entries, topUpEntries([withdrawal({ id: 'notification-def', occurredAt: '2026-11-25T19:46:20+09:00' })])).entries).toHaveLength(2);
  });
});
