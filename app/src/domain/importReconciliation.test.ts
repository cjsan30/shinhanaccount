import { describe, expect, it } from 'vitest';
import { createEmptyLedger, importBankTransactions, importCardTransactions, reclassifyUndecided, saveLedger, loadLedger } from './ledger';
import { resolveImportDuplicate } from './importReconciliation';
const card = (id = '123', time = '12:00:00') => ({ occurredAt: `2026-09-20T${time}+09:00`, merchant: '메가커피', amount: 2700, approvalNumber: id, cardMasked: '1234', paymentStatus: '승인', cancellationStatus: '', classification: { status: 'undecided' as const } });
const bank = (id = 'b1', summary = '체크카드', time = '12:00:23') => ({ source: 'bankCsv' as const, occurredAt: `2026-09-20T${time}+09:00`, merchant: '네이버페이', amount: 2700, transactionId: id, direction: 'withdrawal' as const, summary, classification: { status: 'undecided' as const } });
describe('cross-source import reconciliation', () => {
  it('merges differing names and seconds into an existing undecided entry in both import orders', () => {
    const first = importCardTransactions(createEmptyLedger(), [card()], '1234');
    const merged = importBankTransactions(first.ledger, [bank()], '6789');
    expect(merged).toMatchObject({ imported: 0, mergedUndecided: 1, reviewNeeded: 0 });
    expect(merged.ledger.entries).toHaveLength(1);
    expect(merged.ledger.entries[0]).toMatchObject({ id: first.ledger.entries[0].id, merchant: '메가커피', status: 'undecided' });
    expect(merged.ledger.entries[0].importOrigins).toHaveLength(2);
    const reverse = importCardTransactions(importBankTransactions(createEmptyLedger(), [bank()], '6789').ledger, [card()], '1234');
    expect(reverse).toMatchObject({ mergedUndecided: 1 }); expect(reverse.ledger.entries[0].merchant).toBe('메가커피');
    expect(importBankTransactions(merged.ledger, [bank()], '6789').duplicates).toBe(1);
    expect(importCardTransactions(reverse.ledger, [card()], '1234').duplicates).toBe(1);
  });
  it('preserves the ID, category, memo and existing receipt references of a confirmed entry', () => {
    const first = importCardTransactions(createEmptyLedger(), [card()], '1234').ledger;
    const classified = reclassifyUndecided(first, first.entries[0].id, { bucket: 'resident', category: 'food' }, { resident: 500000, studySpace: 200000 }).ledger;
    classified.entries[0].memo = '보존';
    const merged = importBankTransactions(classified, [bank()], '6789');
    expect(merged).toMatchObject({ imported: 0, mergedConfirmed: 1 });
    expect(merged.ledger.entries[0]).toMatchObject({ id: classified.entries[0].id, status: 'classified', category: 'food', memo: '보존', amount: 2700 });
  });
  it('requires Yes/No for an unproven transfer and preserves confirmed classification on Yes', () => {
    const first = importCardTransactions(createEmptyLedger(), [{ ...card(), classification: { status: 'classified', bucket: 'resident', category: 'food' } }], '1234').ledger;
    const result = importBankTransactions(first, [bank('transfer', '펌뱅킹 이체')], '6789');
    expect(result.reviewNeeded).toBe(1);
    const incoming = result.ledger.entries[1];
    expect(() => reclassifyUndecided(result.ledger, incoming.id, { bucket: 'resident', category: 'food' }, { resident: 500000, studySpace: 200000 })).toThrow();
    const yes = resolveImportDuplicate(result.ledger, incoming.id, first.entries[0].id, true);
    expect(yes.entries).toHaveLength(1); expect(yes.entries[0].category).toBe('food');
    const no = resolveImportDuplicate(result.ledger, incoming.id, first.entries[0].id, false);
    expect(no.entries).toHaveLength(2); expect(no.entries[1].duplicateCandidateIds).toEqual([]);
    expect(reclassifyUndecided(no, incoming.id, { bucket: 'resident', category: 'food' }, { resident: 500000, studySpace: 200000 }).entry.status).toBe('classified');
  });
  it('does not auto-merge one-to-many or many-to-one candidates regardless of row order', () => {
    const cards = importCardTransactions(createEmptyLedger(), [card('a'), card('b', '12:00:30')], '1234').ledger;
    expect(importBankTransactions(cards, [bank()], '6789')).toMatchObject({ mergedUndecided: 0, reviewNeeded: 1 });
    const oneCard = importCardTransactions(createEmptyLedger(), [card()], '1234').ledger;
    expect(importBankTransactions(oneCard, [bank('a'), bank('b', '체크카드', '12:00:40')], '6789')).toMatchObject({ mergedUndecided: 0, reviewNeeded: 2 });
  });
  it('keeps bank-only withdrawals, ignores deposits/out-of-period, and rejects invalid merge targets', () => {
    const result = importBankTransactions(createEmptyLedger(), [bank(), { ...bank('deposit'), direction: 'deposit' }, { ...bank('outside'), occurredAt: '2026-09-13T12:00:00+09:00' }], '6789', '2026-09');
    expect(result).toMatchObject({ imported: 1, undecided: 1, skipped: 2 });
    expect(resolveImportDuplicate(result.ledger, result.ledger.entries[0].id, 'nonexistent', true)).toBe(result.ledger);
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveLedger(storage, result.ledger); expect(loadLedger(storage)).toEqual(result.ledger);
  });
  it('does not merge different amounts, times outside one minute, or cancelled transactions', () => {
    const first = importCardTransactions(createEmptyLedger(), [card()], '1234').ledger;
    expect(importBankTransactions(first, [{ ...bank(), amount: 3000 }], '6789').imported).toBe(1);
    expect(importBankTransactions(first, [bank('late', '체크카드', '12:02:00')], '6789').imported).toBe(1);
    first.entries[0].status = 'cancelled'; expect(importBankTransactions(first, [bank()], '6789').imported).toBe(1);
  });
  it('keeps the same approval number from a different card distinct', () => {
    const first = importCardTransactions(createEmptyLedger(), [card()], '1234').ledger;
    expect(importCardTransactions(first, [card()], '9876').ledger.entries).toHaveLength(2);
  });
  it('persists review decisions and removes a consumed candidate from competing reviews', () => {
    const base = importBankTransactions(createEmptyLedger(), [bank()], '6789').ledger;
    const result = importCardTransactions(base, [card('a'), card('b', '12:00:30')], '1234');
    const incoming = result.ledger.entries[1];
    const yes = resolveImportDuplicate(result.ledger, incoming.id, base.entries[0].id, true);
    expect(yes.entries).toHaveLength(2);
    expect(yes.entries[1].duplicateCandidateIds).toEqual([]);
    const values = new Map<string, string>(); const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    saveLedger(storage, result.ledger); expect(loadLedger(storage)).toEqual(result.ledger);
  });
});
