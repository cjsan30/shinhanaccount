import { describe, expect, it } from 'vitest';
import { isDateInPolicyPeriod } from './budget';
import { filterImportToPolicyPeriod } from './periodSelectors';
import { createEmptyLedger, getCategorySpent, importCardTransactions } from './ledger';
import { POLICY_BOOK_STORAGE_KEY, createPolicyBook, getEffectivePolicy, loadPolicyBook, parsePolicyText, savePolicyBook } from './policy';
import { getReportReadiness } from './reportReadiness';

const plan = () => parsePolicyText('식비 200000원 교육비 160000원 교통비 140000원 카페 200000원');

describe('deposit-based policy period consistency', () => {
  it('rejects an invalid date', () => {
    expect(isDateInPolicyPeriod(new Date('invalid'), '2026-09')).toBe(false);
  });

  it('stores payments before the deposit but counts only those after it everywhere', () => {
    const period = { startDay: 11, endDay: 10, start: { periodKey: '2026-09', at: '2026-09-13T00:00:00+09:00' } };
    const records = [10, 11, 13, 20].map((day) => ({ transactionId: `t${day}`, occurredAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00+09:00`, merchant: 'sample', amount: 1000, cardMasked: '****1234', approvalNumber: `0000${day}`, paymentStatus: '승인', cancellationStatus: '' }));
    expect(filterImportToPolicyPeriod(records, '2026-09', period).included).toHaveLength(3);
    const imported = importCardTransactions(createEmptyLedger(), records, '1234', '2026-09', period);
    expect(imported.imported).toBe(3);
    const entries = imported.ledger.entries.map((entry) => ({ ...entry, status: 'classified' as const, bucket: 'resident' as const, category: 'food' }));
    expect(getCategorySpent({ ...imported.ledger, entries }, 'resident', 'food', '2026-09', period)).toBe(2000);
    expect(getReportReadiness(entries, [], '2026-09', period).payments).toHaveLength(2);
  });

  it('keeps a plan saved before the deposit start at its old start day', () => {
    localStorage.clear();
    const date = new Date('2026-09-20T12:00:00+09:00');
    const book = createPolicyBook(plan(), date);
    localStorage.setItem(POLICY_BOOK_STORAGE_KEY, JSON.stringify({ versions: [{ ...book.versions[0], period: { startDay: 15, endDay: 10 } }, { ...book.versions[0], periodKey: '2026-08', period: { startDay: 1, endDay: 31 } }] }));
    const loaded = loadPolicyBook(localStorage);
    expect(loaded.versions.map((version) => version.funding)).toEqual([
      { status: 'deposited', depositDate: '2026-09-15', startAt: '2026-09-15T00:00:00+09:00', migrated: true },
      { status: 'deposited', depositDate: '2026-08-11', startAt: '2026-08-11T00:00:00+09:00', migrated: true },
    ]);
    expect(getEffectivePolicy(loaded, date)).toMatchObject({ confirmed: true, policy: { period: { startDay: 11, endDay: 10, start: { periodKey: '2026-09', at: '2026-09-15T00:00:00+09:00' } } } });
  });

  it('keeps the deposit state through save and load', () => {
    localStorage.clear();
    const date = new Date('2026-09-12T12:00:00+09:00');
    savePolicyBook(localStorage, createPolicyBook(plan(), date, { status: 'pending' }));
    expect(getEffectivePolicy(loadPolicyBook(localStorage), date)).toMatchObject({ confirmed: true, funding: { status: 'pending' }, policy: { period: { start: { periodKey: '2026-09', at: null } } } });
  });

  it('does not apply a reserved future schedule early', () => {
    const date = new Date('2026-09-20T12:00:00+09:00');
    const book = createPolicyBook(plan(), date);
    book.versions.push({ ...plan(), plans: { ...plan().plans, food: 150000 }, periodKey: '2026-10', confirmedAt: date.toISOString() });
    expect(getEffectivePolicy(book, date)).toMatchObject({ periodKey: '2026-09', policy: { plans: { food: 200000 } } });
    expect(getEffectivePolicy(book, new Date('2026-10-11T12:00:00+09:00'))).toMatchObject({ periodKey: '2026-10', policy: { plans: { food: 150000 } } });
  });
});
