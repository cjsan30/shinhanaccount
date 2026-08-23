import { describe, expect, it } from 'vitest';
import { applyPayment, cancelPayment, createInitialLedger, removeLedgerEntry, updateLedgerEntry, findCancellationCandidates, getAutoCancellationMatch, getRecentEntries, getSummary, importCardTransactions, loadLedger, reclassifyUndecided, saveAsUndecided, saveLedger } from './ledger';
import { classifyPayment } from './sms';
import { POLICY_MAX_LIMITS } from './budget';

const wellstory5000 = { cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '삼성웰스토리(주)크래프톤정' };

describe('expense ledger', () => {
  it('separates spending by the policy period beginning on the 14th', () => {
    const ledger = { ...createInitialLedger(), entries: [] };
    const first = applyPayment(ledger, { ...wellstory5000, occurredAt: '2026-08-10T23:59:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    const gap = applyPayment(first.ledger, { ...wellstory5000, occurredAt: '2026-08-11T12:00:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    const second = applyPayment(gap.ledger, { ...wellstory5000, occurredAt: '2026-08-14T00:00:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    expect(getSummary(second.ledger, 'resident', 500000, '2026-07').spent).toBe(8000);
    expect(getSummary(second.ledger, 'resident', 500000, '2026-08').spent).toBe(8000);
    expect(getRecentEntries(second.ledger, '2026-07').map((entry) => entry.occurredAt)).toEqual(['2026-08-10T23:59:00+09:00']);
  });
  it('preserves the manual source on a directly entered expense', () => {
    const result = applyPayment({ ...createInitialLedger(), entries: [] }, { ...wellstory5000, id: 'manual-test', source: 'manual' }, POLICY_MAX_LIMITS);
    expect(result.entry.source).toBe('manual');
  });
  it('keeps two identical same-minute notification payments when their posted milliseconds differ', () => {
    const first = applyPayment({ ...createInitialLedger(), entries: [] }, { ...wellstory5000, id: 'notification-1000', notificationPostedAt: 1000, source: 'notification' }, POLICY_MAX_LIMITS);
    const second = applyPayment(first.ledger, { ...wellstory5000, id: 'notification-2000', notificationPostedAt: 2000, source: 'notification' }, POLICY_MAX_LIMITS);
    const repeated = applyPayment(second.ledger, { ...wellstory5000, id: 'notification-2000', notificationPostedAt: 2000, source: 'notification' }, POLICY_MAX_LIMITS);

    expect(second.ledger.entries).toHaveLength(2);
    expect(second.ledger.entries.map((entry) => entry.notificationPostedAt)).toEqual([1000, 2000]);
    expect(repeated.ledger.entries).toHaveLength(2);
  });
  it('stores a 5,000 won Samsung Wellstory approval in study-space general cafe', () => {
    const result = applyPayment(createInitialLedger(), wellstory5000, POLICY_MAX_LIMITS);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'studySpace', category: 'generalCafe' });
    expect(getSummary(result.ledger, 'studySpace', POLICY_MAX_LIMITS.studySpace)).toMatchObject({ spent: 82700, remaining: 117300 });
  });

  it('emits crossed alert thresholds only for the affected budget', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = applyPayment(ledger, { ...wellstory5000, amount: 101000 }, POLICY_MAX_LIMITS);
    expect(result.alerts).toEqual([50]);
    expect(getSummary(result.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(0);
  });

  it('uses the selected support-item plan instead of the whole budget for alerts', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = applyPayment(ledger, { ...wellstory5000, amount: 130000 }, { resident: 500000, studySpace: 200000 }, { generalCafe: 250000 });
    expect(result.alerts).toEqual([50]);
  });

  it('keeps excluded payments out of budget spending and prevents duplicates', () => {
    const payment = { ...wellstory5000, merchant: '주식회사 아이햅슨', amount: 12500 };
    const once = applyPayment(createInitialLedger(), payment, POLICY_MAX_LIMITS);
    const twice = applyPayment(once.ledger, payment, POLICY_MAX_LIMITS);
    expect(once.entry.status).toBe('excluded');
    expect(getSummary(once.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(215700);
    expect(twice.ledger.entries).toHaveLength(once.ledger.entries.length);
  });

  it('lets a user store an otherwise classifiable payment as undecided', () => {
    const result = saveAsUndecided(createInitialLedger(), wellstory5000);
    expect(result.entry.status).toBe('undecided');
    expect(getSummary(result.ledger, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(77700);
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
  it('does not duplicate the same transaction when SMS and Excel use different identifiers', () => {
    const smsLedger = applyPayment({ ...createInitialLedger(), entries: [] }, wellstory5000, POLICY_MAX_LIMITS).ledger;
    const transaction = { occurredAt: wellstory5000.occurredAt, cardMasked: '374*', merchant: wellstory5000.merchant, approvalNumber: '00459878', amount: wellstory5000.amount, paymentStatus: '승인', cancellationStatus: '', classification: classifyPayment(wellstory5000.merchant, wellstory5000.amount) };

    expect(importCardTransactions(smsLedger, [transaction], '3741')).toMatchObject({ imported: 0, duplicates: 1 });
    const excelLedger = importCardTransactions({ ...createInitialLedger(), entries: [] }, [transaction], '3741').ledger;
    expect(applyPayment(excelLedger, wellstory5000, POLICY_MAX_LIMITS).ledger.entries).toHaveLength(1);
  });
  it('round-trips the ledger through local storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const ledger = applyPayment(createInitialLedger(), wellstory5000, POLICY_MAX_LIMITS).ledger;
    saveLedger(storage, ledger);
    expect(loadLedger(storage)).toEqual(ledger);
  });
  it('updates and removes a ledger entry without affecting other entries', () => {
    const applied = applyPayment({ ...createInitialLedger(), entries: [] }, wellstory5000, POLICY_MAX_LIMITS);
    const updated = updateLedgerEntry(applied.ledger, applied.entry.id, { merchant: '수정 카페', amount: 7000, occurredAt: '2026-07-25T12:00:00+09:00', bucket: 'studySpace', category: 'generalCafe' });
    expect(updated.entries[0]).toMatchObject({ merchant: '수정 카페', amount: 7000, source: 'manual' });
    expect(removeLedgerEntry(updated, applied.entry.id).entries).toHaveLength(0);
  });  it('moves an undecided expense into a user-selected support item', () => {
    const saved = saveAsUndecided(createInitialLedger(), wellstory5000);
    const result = reclassifyUndecided(saved.ledger, saved.entry.id, { bucket: 'resident', category: 'transport' }, POLICY_MAX_LIMITS);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'resident', category: 'transport', source: 'manual' });
    expect(getSummary(result.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(220700);
  });
  it('matches a cancellation only when amount, merchant, and card all agree', () => {
    const approved = applyPayment({ ...createInitialLedger(), entries: [] }, wellstory5000, POLICY_MAX_LIMITS).ledger;
    const notice = { ...wellstory5000, occurredAt: '2026-07-25T10:00:00+09:00' };
    expect(findCancellationCandidates(approved, notice)).toHaveLength(1);
    expect(getAutoCancellationMatch(approved, notice)?.id).toContain('2026-07-24');
    expect(getAutoCancellationMatch(approved, { ...notice, merchant: '다른 상호' })).toBeNull();
  });
  it('removes a confirmed cancellation from the affected budget without deleting its history', () => {
    const applied = applyPayment(createInitialLedger(), wellstory5000, POLICY_MAX_LIMITS);
    const cancelled = cancelPayment(applied.ledger, applied.entry.id, '2026-07-25T10:00:00+09:00');
    expect(cancelled.entries.find((entry) => entry.id === applied.entry.id)).toMatchObject({ status: 'cancelled', cancelledAt: '2026-07-25T10:00:00+09:00' });
    expect(getSummary(cancelled, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(77700);
  });
});

it('shows recent payments by occurrence time instead of insertion order', () => {
  const ledger = createInitialLedger();
  ledger.entries = [
    { id: 'older', cardLast4: '3741', occurredAt: '2026-08-14T12:00:00+09:00', amount: 1, merchant: 'older', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
    { id: 'newer', cardLast4: '3741', occurredAt: '2026-08-18T12:00:00+09:00', amount: 1, merchant: 'newer', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
    { id: 'middle', cardLast4: '3741', occurredAt: '2026-08-15T12:00:00+09:00', amount: 1, merchant: 'middle', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
  ];
  expect(getRecentEntries(ledger, '2026-08').map((entry) => entry.id)).toEqual(['newer', 'middle', 'older']);
});

it('shows the full policy period through the selected local day', () => {
  const ledger = createInitialLedger();
  ledger.entries = [
    { id: 'today', cardLast4: '3741', occurredAt: '2026-08-19T12:00:00+09:00', amount: 1, merchant: 'today', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
    { id: 'future', cardLast4: '3741', occurredAt: '2026-08-20T12:00:00+09:00', amount: 1, merchant: 'future', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
  ];
  expect(getRecentEntries(ledger, '2026-08', Number.POSITIVE_INFINITY, new Date('2026-08-19T23:59:59+09:00')).map((entry) => entry.id)).toEqual(['today']);
});
