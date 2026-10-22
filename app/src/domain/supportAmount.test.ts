import { describe, expect, it } from 'vitest';
import { applyCancellation, createEmptyLedger, getCategorySpent, getRemainingPaymentAmount, getSpent, getSupportAmount, importBankTransactions, markAsUndecided, reclassifyUndecided, setSupportAmount, type LedgerEntry } from './ledger';
import { normalizeAppState, denormalizeAppState } from '../native/normalizedState';

const entry: LedgerEntry = { id: 'approval-card', source: 'excel', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', amount: 50000, merchant: '메가커피', status: 'undecided' };
const fresh = () => ({ ...createEmptyLedger(), entries: [{ ...entry }] });
const limits = { resident: 50000, studySpace: 50000 };

describe('subsidy portion and cancellation integration', () => {
  it('keeps the actual amount and uses only the selected portion for budgets and alerts', () => {
    const selected = setSupportAmount(fresh(), entry.id, 30000);
    const result = reclassifyUndecided(selected, entry.id, { bucket: 'resident', category: 'food' }, limits);
    expect(result.entry.amount).toBe(50000); expect(result.entry.supportAmount).toBe(30000);
    expect(getSpent(result.ledger, 'resident')).toBe(30000);
    expect(getCategorySpent(result.ledger, 'resident', 'food')).toBe(30000);
    expect(result.alerts).toEqual([50]);
  });
  it('defaults legacy entries to their actual remaining amount', () => {
    expect(getSupportAmount(entry)).toBe(50000);
    expect(getSupportAmount({ ...entry, cancelledAmount: 10000 })).toBe(40000);
  });
  it.each([0, -1, 50001, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid subsidy input %s without mutating the ledger', (amount) => {
    const ledger = fresh(); expect(() => setSupportAmount(ledger, entry.id, amount)).toThrow(); expect(ledger.entries[0]).toEqual(entry);
  });
  it('does not edit unresolved duplicate candidates or classified payments', () => {
    expect(() => setSupportAmount({ ...fresh(), entries: [{ ...entry, duplicateCandidateIds: ['other'] }] }, entry.id, 1000)).toThrow();
    expect(() => setSupportAmount({ ...fresh(), entries: [{ ...entry, status: 'classified' }] }, entry.id, 1000)).toThrow();
  });
  it('keeps classification and links on partial cancellation until the user returns it to undecided', () => {
    const classified = reclassifyUndecided(setSupportAmount(fresh(), entry.id, 30000), entry.id, { bucket: 'resident', category: 'food' }, limits).ledger;
    const cancelled = applyCancellation(classified, entry.id, 35000, '2026-09-21T12:00:00+09:00');
    expect(cancelled.entries[0]).toMatchObject({ status: 'classified', amount: 50000, supportAmount: 30000, supportAmountReviewRequired: true, previousSupportAmount: 30000 });
    expect(getSpent(cancelled, 'resident')).toBe(15000);
    expect(getRemainingPaymentAmount(cancelled.entries[0])).toBe(15000);
    const undecided = markAsUndecided(cancelled, entry.id);
    expect(getSpent(undecided, 'resident')).toBe(0);
    expect(undecided.entries[0]).toMatchObject({ previousClassification: { bucket: 'resident', category: 'food' }, previousSupportAmount: 30000 });
    expect(() => setSupportAmount(undecided, entry.id, 15001)).toThrow();
    const next = reclassifyUndecided(setSupportAmount(undecided, entry.id, 10000), entry.id, { bucket: 'resident', category: 'transport' }, limits);
    expect(next.entry.supportAmountReviewRequired).toBe(false); expect(getSpent(next.ledger, 'resident')).toBe(10000);
  });
  it('returns zero support usage after full cancellation', () => {
    const cancelled = applyCancellation(fresh(), entry.id, 50000, entry.occurredAt);
    expect(getSupportAmount(cancelled.entries[0])).toBe(0);
  });
  it('still reconciles by original amounts and preserves the confirmed subsidy portion', () => {
    const classified = reclassifyUndecided(setSupportAmount(fresh(), entry.id, 30000), entry.id, { bucket: 'resident', category: 'food' }, limits).ledger;
    const imported = importBankTransactions(classified, [{ source: 'bankCsv', transactionId: 'bank', occurredAt: entry.occurredAt, merchant: '네이버페이', amount: 50000, direction: 'withdrawal', summary: '체크카드' }], '6789');
    expect(imported.mergedConfirmed).toBe(1); expect(imported.ledger.entries).toHaveLength(1);
    expect(imported.ledger.entries[0]).toMatchObject({ amount: 50000, supportAmount: 30000, category: 'food' });
  });
  it('round-trips the portion and review references through normalized encrypted state', () => {
    const state = { ledger: { ...fresh(), entries: [{ ...entry, supportAmount: 30000, supportAmountReviewRequired: true, previousSupportAmount: 40000 }] }, policyBook: { versions: [] }, merchantRules: [] };
    expect(denormalizeAppState(normalizeAppState(state))).toEqual(state);
  });
});
