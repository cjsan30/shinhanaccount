import { describe, expect, it } from 'vitest';
import { getPolicyPeriodKey, getPolicyPeriodRange, isDateInPolicyPeriod, normalizePolicyPeriod } from './budget';
import { filterImportToPolicyPeriod } from './importPolicy';
import { createEmptyLedger, getCategorySpent, importCardTransactions } from './ledger';
import { createPolicyBook, getEffectivePolicy, loadPolicyBook, parsePolicyText, savePolicyBook } from './policy';
import { getReportReadiness } from './reportReadiness';
describe('custom policy period consistency', () => {
  it('supports same-month windows and leap-year/month-end boundaries', () => {
    expect(getPolicyPeriodRange('2028-02', { startDay: 1, endDay: 31 })).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(getPolicyPeriodRange('2026-12', { startDay: 31, endDay: 10 })).toEqual({ start: '2026-12-31', end: '2027-01-10' });
    expect(getPolicyPeriodKey(new Date('2026-02-28T12:00:00+09:00'), { startDay: 31, endDay: 10 })).toBe('2026-02');
    expect(isDateInPolicyPeriod(new Date('invalid'), '2026-09')).toBe(false);
    expect(normalizePolicyPeriod({ startDay: 0, endDay: 100 })).toEqual({ startDay: 15, endDay: 10 });
  });
  it('applies identical boundaries to import, budgets and receipt candidates', () => {
    const period = { startDay: 1, endDay: 10 };
    const records = [1, 10, 11, 15].map((day) => ({ transactionId: `t${day}`, occurredAt: `2026-09-${String(day).padStart(2, '0')}T12:00:00+09:00`, merchant: 'sample', amount: 1000, cardMasked: '****1234', approvalNumber: `0000${day}`, paymentStatus: '승인', cancellationStatus: '', classification: { status: 'undecided' as const } }));
    expect(filterImportToPolicyPeriod(records, '2026-09', period).included).toHaveLength(2);
    const imported = importCardTransactions(createEmptyLedger(), records, '1234', '2026-09', period);
    expect(imported.imported).toBe(2);
    const entries = imported.ledger.entries.map((entry) => ({ ...entry, status: 'classified' as const, bucket: 'resident' as const, category: 'food' }));
    expect(getCategorySpent({ ...imported.ledger, entries }, 'resident', 'food', '2026-09', period)).toBe(2000);
    expect(getReportReadiness(entries, [], '2026-09', period).payments).toHaveLength(2);
  });
  it('persists custom dates without changing legacy default records', () => {
    localStorage.clear(); const date = new Date('2026-09-20T12:00:00+09:00');
    const policy = { ...parsePolicyText('식비 200000원 교육비 160000원 교통비 140000원 카페 200000원'), period: { startDay: 1, endDay: 31 } };
    const book = createPolicyBook(policy, date); savePolicyBook(localStorage, book);
    expect(getEffectivePolicy(loadPolicyBook(localStorage), date)).toMatchObject({ confirmed: true, policy: { period: policy.period } });
  });
  it('does not apply a reserved future schedule early', () => {
    const date = new Date('2026-09-20T12:00:00+09:00');
    const policy = parsePolicyText('식비 200000원 교육비 160000원 교통비 140000원 카페 200000원');
    const book = createPolicyBook(policy, date);
    book.versions.push({ ...policy, period: { startDay: 1, endDay: 31 }, periodKey: '2026-10', confirmedAt: date.toISOString() });
    expect(getEffectivePolicy(book, date).periodKey).toBe('2026-09');
    expect(getEffectivePolicy(book, new Date('2026-10-01T12:00:00+09:00')).policy.period?.startDay).toBe(1);
  });
});
