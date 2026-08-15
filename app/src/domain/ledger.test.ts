import { describe, expect, it } from 'vitest';
import { applyPayment, cancelPayment, createInitialLedger, findCancellationCandidates, getAutoCancellationMatch, getSummary, importCardTransactions, loadLedger, reclassifyUndecided, saveAsUndecided, saveLedger } from './ledger';
import { classifyPayment } from './sms';

const wellstory5000 = { cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '삼성웰스토리(주)크래프톤정' };

describe('expense ledger', () => {
  it('separates spending by the policy period beginning on the 10th', () => {
    const ledger = { ...createInitialLedger(), entries: [] };
    const first = applyPayment(ledger, { ...wellstory5000, occurredAt: '2026-08-09T23:59:00+09:00', amount: 8000 });
    const second = applyPayment(first.ledger, { ...wellstory5000, occurredAt: '2026-08-10T00:00:00+09:00', amount: 8000 });
    expect(getSummary(second.ledger, 'resident', 500000, '2026-07').spent).toBe(8000);
    expect(getSummary(second.ledger, 'resident', 500000, '2026-08').spent).toBe(8000);
  });
  it('stores a 5,000 won Samsung Wellstory approval in study-space general cafe', () => {
    const result = applyPayment(createInitialLedger(), wellstory5000);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'studySpace', category: 'generalCafe' });
    expect(getSummary(result.ledger, 'studySpace')).toMatchObject({ spent: 82700, remaining: 117300 });
  });

  it('emits crossed alert thresholds only for the affected budget', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = applyPayment(ledger, { ...wellstory5000, amount: 101000 });
    expect(result.alerts).toEqual([50]);
    expect(getSummary(result.ledger, 'resident').spent).toBe(0);
  });

  it('uses the selected support-item plan instead of the whole budget for alerts', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = applyPayment(ledger, { ...wellstory5000, amount: 130000 }, { resident: 500000, studySpace: 200000 }, { generalCafe: 250000 });
    expect(result.alerts).toEqual([50]);
  });

  it('keeps excluded payments out of budget spending and prevents duplicates', () => {
    const payment = { ...wellstory5000, merchant: '주식회사 아이햅슨', amount: 12500 };
    const once = applyPayment(createInitialLedger(), payment);
    const twice = applyPayment(once.ledger, payment);
    expect(once.entry.status).toBe('excluded');
    expect(getSummary(once.ledger, 'resident').spent).toBe(215700);
    expect(twice.ledger.entries).toHaveLength(once.ledger.entries.length);
  });

  it('lets a user store an otherwise classifiable payment as undecided', () => {
    const result = saveAsUndecided(createInitialLedger(), wellstory5000);
    expect(result.entry.status).toBe('undecided');
    expect(getSummary(result.ledger, 'studySpace').spent).toBe(77700);
  });

  it('replaces demo entries once, then merges future exports by approval number', () => {
    const transaction = { occurredAt: '2026-07-24T17:58:00+09:00', cardMasked: '374*', merchant: 'Samsung Wellstory', approvalNumber: '00459878', amount: 5000, paymentStatus: '승인', cancellationStatus: '', classification: classifyPayment('Samsung Wellstory', 5000) };
    const first = importCardTransactions(createInitialLedger(), [transaction], '3741');
    expect(first).toMatchObject({ imported: 1, replacedDemo: true });
    expect(first.ledger.entries).toHaveLength(1);
    expect(first.ledger.entries[0].cardLast4).toBe('3741');
    const second = importCardTransactions(first.ledger, [transaction], '3741');
    expect(second).toMatchObject({ imported: 0, duplicates: 1, replacedDemo: false });
  });
  it('round-trips the ledger through local storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const ledger = applyPayment(createInitialLedger(), wellstory5000).ledger;
    saveLedger(storage, ledger);
    expect(loadLedger(storage)).toEqual(ledger);
  });
  it('moves an undecided expense into a user-selected support item', () => {
    const saved = saveAsUndecided(createInitialLedger(), wellstory5000);
    const result = reclassifyUndecided(saved.ledger, saved.entry.id, { bucket: 'resident', category: 'transport' });
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'resident', category: 'transport', source: 'manual' });
    expect(getSummary(result.ledger, 'resident').spent).toBe(220700);
  });
  it('matches a cancellation only when amount, merchant, and card all agree', () => {
    const approved = applyPayment({ ...createInitialLedger(), entries: [] }, wellstory5000).ledger;
    const notice = { ...wellstory5000, occurredAt: '2026-07-25T10:00:00+09:00' };
    expect(findCancellationCandidates(approved, notice)).toHaveLength(1);
    expect(getAutoCancellationMatch(approved, notice)?.id).toContain('2026-07-24');
    expect(getAutoCancellationMatch(approved, { ...notice, merchant: '다른 상호' })).toBeNull();
  });
  it('removes a confirmed cancellation from the affected budget without deleting its history', () => {
    const applied = applyPayment(createInitialLedger(), wellstory5000);
    const cancelled = cancelPayment(applied.ledger, applied.entry.id, '2026-07-25T10:00:00+09:00');
    expect(cancelled.entries.find((entry) => entry.id === applied.entry.id)).toMatchObject({ status: 'cancelled', cancelledAt: '2026-07-25T10:00:00+09:00' });
    expect(getSummary(cancelled, 'studySpace').spent).toBe(77700);
  });
});