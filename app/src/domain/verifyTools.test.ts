import { describe, expect, it } from 'vitest';
import { createEmptyLedger, type LedgerEntry } from './ledger';
import { emptyPolicy, type PolicyBook } from './policy';
import { TEST_PAYMENT_PREFIX, addTestPayments, getDateOffset, removeTestPayments, resetPeriodForVerification } from './verifyTools';

const DAY = 86_400_000;

describe('verification tools', () => {
  it('moves today by whole days in Korea time', () => {
    const lateEvening = Date.parse('2026-11-15T23:30:00+09:00');
    expect(getDateOffset('2026-11-20', lateEvening)).toBe(5 * DAY);
    expect(getDateOffset('2026-11-15', lateEvening)).toBe(0);
    expect(getDateOffset('2026-11-11', Date.parse('2026-11-15T00:10:00+09:00'))).toBe(-4 * DAY);
  });

  it('removes only this period plan and restores its before-deposit payments', () => {
    const version = (periodKey: string) => ({ ...emptyPolicy, periodKey, confirmedAt: `${periodKey}-15T00:00:00+09:00` });
    const book: PolicyBook = { versions: [version('2026-10'), { ...version('2026-11'), funding: { status: 'pending' } }] };
    const excluded = (id: string, occurredAt: string): LedgerEntry => ({ id, cardLast4: '0000', occurredAt, amount: 5000, merchant: id, status: 'excluded', beforeDeposit: { status: 'classified', bucket: 'resident', category: 'food' } });
    const ledger = { ...createEmptyLedger(), entries: [excluded('now', '2026-11-12T09:00:00+09:00'), excluded('before', '2026-10-12T09:00:00+09:00')] };
    const reset = resetPeriodForVerification(book, ledger, '2026-11');
    expect(reset.book.versions.map((item) => item.periodKey)).toEqual(['2026-10']);
    expect(reset.ledger.entries.map((entry) => [entry.id, entry.status, Boolean(entry.beforeDeposit)])).toEqual([['now', 'classified', false], ['before', 'excluded', true]]);
  });

  it('adds three marked payments on the chosen day and removes only those', () => {
    const own: LedgerEntry = { id: 'real', cardLast4: '0000', occurredAt: '2026-11-13T10:00:00+09:00', amount: 1000, merchant: '실제', status: 'undecided' };
    const added = addTestPayments({ ...createEmptyLedger(), entries: [own] }, '2026-11-13');
    const tests = added.entries.filter((entry) => entry.id.startsWith(TEST_PAYMENT_PREFIX));
    expect(tests.map((entry) => entry.occurredAt)).toEqual(['2026-11-13T09:00:00+09:00', '2026-11-13T13:00:00+09:00', '2026-11-13T18:00:00+09:00']);
    expect(tests.every((entry) => entry.status === 'classified' && entry.amount === 5000)).toBe(true);
    expect(removeTestPayments(added).entries).toEqual([own]);
  });
});
