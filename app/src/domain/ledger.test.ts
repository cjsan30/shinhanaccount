import { describe, expect, it } from 'vitest';
import { applyPayment, createInitialLedger, getSummary, importCardTransactions, loadLedger, saveAsUndecided, saveLedger } from './ledger';
import { classifyPayment } from './sms';

const wellstory5000 = { cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '삼성웰스토리(주)크래프톤정' };

describe('expense ledger', () => {
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
    const first = importCardTransactions(createInitialLedger(), [transaction]);
    expect(first).toMatchObject({ imported: 1, replacedDemo: true });
    expect(first.ledger.entries).toHaveLength(1);
    const second = importCardTransactions(first.ledger, [transaction]);
    expect(second).toMatchObject({ imported: 0, duplicates: 1, replacedDemo: false });
  });
  it('round-trips the ledger through local storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const ledger = applyPayment(createInitialLedger(), wellstory5000).ledger;
    saveLedger(storage, ledger);
    expect(loadLedger(storage)).toEqual(ledger);
  });
});