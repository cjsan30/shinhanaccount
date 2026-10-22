import { describe, expect, it } from 'vitest';
import { createEmptyLedger, applyCancellation, applyPayment, cancelPayment, createInitialLedger, excludeUndecided, markAsUndecided, removeLedgerEntry, updateLedgerEntry, findCancellationCandidates, findSuspectedDuplicates, getAutoCancellationMatch, getHistoryEntries, getRecentEntries, getSummary, importBankTransactions, importCardTransactions, loadLedger, reclassifyUndecided, saveAsUndecided, saveLedger } from './ledger';
import { classifyWithMerchantRules, createMerchantRule } from './merchantRules';
import { POLICY_MAX_LIMITS, type BudgetKey } from './budget';
import type { Ledger } from './ledger';
import type { NativeApproval } from '../native/smsBridge';

const cafe5000 = { cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '테스트 카페' };
// The user has registered rules for these test merchants; without a rule a payment stays undecided.
const userRules = [
  createMerchantRule('테스트 카페', { bucket: 'studySpace', category: 'generalCafe' }, '2026-07-01T00:00:00.000Z'),
  createMerchantRule('테스트 식당', { bucket: 'resident', category: 'food' }, '2026-07-01T00:00:00.000Z'),
];
const apply = (ledger: Ledger, payment: NativeApproval, limits: Record<BudgetKey, number>, categoryLimits: Record<string, number> = {}) =>
  applyPayment(ledger, payment, limits, categoryLimits, (merchant) => classifyWithMerchantRules(merchant, userRules));

describe('expense ledger', () => {
  it('uses a notification quick classification before merchant auto rules', () => {
    const result = applyPayment({ ...createInitialLedger(), entries: [] }, {
      id: 'quick-food', cardLast4: '1111', occurredAt: '2026-08-20T12:00:00+09:00', amount: 7000, merchant: '처음 보는 결제처', quickCategory: 'food',
    }, POLICY_MAX_LIMITS);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'resident', category: 'food' });
  });
  it('separates spending by the policy period beginning on the 15th', () => {
    const ledger = { ...createInitialLedger(), entries: [] };
    const first = apply(ledger, { ...cafe5000, merchant: '테스트 식당', occurredAt: '2026-08-10T23:59:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    const gap = apply(first.ledger, { ...cafe5000, merchant: '테스트 식당', occurredAt: '2026-08-11T12:00:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    const second = apply(gap.ledger, { ...cafe5000, merchant: '테스트 식당', occurredAt: '2026-08-15T00:00:00+09:00', amount: 8000 }, POLICY_MAX_LIMITS);
    expect(getSummary(second.ledger, 'resident', 500000, '2026-07').spent).toBe(8000);
    expect(getSummary(second.ledger, 'resident', 500000, '2026-08').spent).toBe(8000);
    expect(getRecentEntries(second.ledger, '2026-07').map((entry) => entry.occurredAt)).toEqual(['2026-08-10T23:59:00+09:00']);
  });
  it('preserves the manual source on a directly entered expense', () => {
    const result = apply({ ...createInitialLedger(), entries: [] }, { ...cafe5000, id: 'manual-test', source: 'manual' }, POLICY_MAX_LIMITS);
    expect(result.entry.source).toBe('manual');
  });
  it('keeps two identical same-minute notification payments when their posted milliseconds differ', () => {
    const first = apply({ ...createInitialLedger(), entries: [] }, { ...cafe5000, id: 'notification-1000', notificationPostedAt: 1000, source: 'notification' }, POLICY_MAX_LIMITS);
    const second = apply(first.ledger, { ...cafe5000, id: 'notification-2000', notificationPostedAt: 2000, source: 'notification' }, POLICY_MAX_LIMITS);
    const repeated = apply(second.ledger, { ...cafe5000, id: 'notification-2000', notificationPostedAt: 2000, source: 'notification' }, POLICY_MAX_LIMITS);

    expect(second.ledger.entries).toHaveLength(2);
    expect(second.ledger.entries.map((entry) => entry.notificationPostedAt)).toEqual([1000, 2000]);
    expect(repeated.ledger.entries).toHaveLength(2);
  });
  it('classifies a payment by the user rule into study-space general cafe', () => {
    const result = apply(createInitialLedger(), cafe5000, POLICY_MAX_LIMITS);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'studySpace', category: 'generalCafe' });
    expect(getSummary(result.ledger, 'studySpace', POLICY_MAX_LIMITS.studySpace)).toMatchObject({ spent: 82700, remaining: 117300 });
  });

  it('emits crossed alert thresholds only for the affected budget', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = apply(ledger, { ...cafe5000, amount: 101000 }, POLICY_MAX_LIMITS);
    expect(result.alerts).toEqual([50]);
    expect(getSummary(result.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(0);
  });

  it('uses the selected support-item plan instead of the whole budget for alerts', () => {
    const ledger = { ...createInitialLedger(), entries: [], alertThresholds: [50, 80] as [number, number] };
    const result = apply(ledger, { ...cafe5000, amount: 130000 }, { resident: 500000, studySpace: 200000 }, { generalCafe: 250000 });
    expect(result.alerts).toEqual([50]);
  });

  it('keeps a payment without a matching user rule undecided, out of spending, and deduplicated', () => {
    const payment = { ...cafe5000, merchant: '규칙 없는 가게', amount: 12500 };
    const once = apply(createInitialLedger(), payment, POLICY_MAX_LIMITS);
    const twice = apply(once.ledger, payment, POLICY_MAX_LIMITS);
    expect(once.entry.status).toBe('undecided');
    expect(getSummary(once.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(215700);
    expect(twice.ledger.entries).toHaveLength(once.ledger.entries.length);
  });

  it('lets a user store an otherwise classifiable payment as undecided', () => {
    const result = saveAsUndecided(createInitialLedger(), cafe5000);
    expect(result.entry.status).toBe('undecided');
    expect(getSummary(result.ledger, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(77700);
  });

  it('replaces demo entries once, then merges future exports by approval number', () => {
    const transaction = { occurredAt: '2026-07-24T17:58:00+09:00', cardMasked: '374*', merchant: '테스트 카페', approvalNumber: '00459878', amount: 5000, paymentStatus: '승인', cancellationStatus: '' };
    const first = importCardTransactions(createInitialLedger(), [transaction], '3741');
    expect(first).toMatchObject({ imported: 1, replacedDemo: true });
    expect(first.ledger.entries).toHaveLength(1);
    expect(first.ledger.entries[0].cardLast4).toBe('3741');
    const second = importCardTransactions(first.ledger, [transaction], '3741');
    expect(second).toMatchObject({ imported: 0, duplicates: 1, replacedDemo: false });
  });
  it('does not duplicate the same transaction when SMS and Excel use different identifiers', () => {
    const smsLedger = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS).ledger;
    const transaction = { occurredAt: cafe5000.occurredAt, cardMasked: '374*', merchant: cafe5000.merchant, approvalNumber: '00459878', amount: cafe5000.amount, paymentStatus: '승인', cancellationStatus: '' };

    expect(importCardTransactions(smsLedger, [transaction], '3741')).toMatchObject({ imported: 0, duplicates: 1 });
    const excelLedger = importCardTransactions({ ...createInitialLedger(), entries: [] }, [transaction], '3741').ledger;
    expect(apply(excelLedger, cafe5000, POLICY_MAX_LIMITS).ledger.entries).toHaveLength(1);
  });
  it('does not store imported transactions outside the selected policy period', () => {
    const transaction = { occurredAt: '2026-09-13T12:00:00+09:00', cardMasked: '374*', merchant: '테스트 카페', approvalNumber: '00459879', amount: 5000, paymentStatus: '승인', cancellationStatus: '' };
    const result = importCardTransactions({ ...createInitialLedger(), entries: [] }, [transaction], '3741', '2026-09');
    expect(result.imported).toBe(0);
    expect(result.ledger.entries).toHaveLength(0);
    expect(result.replacedDemo).toBe(false);
  });
  it('imports only policy-period withdrawals from a bank statement as undecided expenses', () => {
    const transactions = [
      { source: 'bankCsv' as const, occurredAt: '2026-09-20T12:00:00+09:00', accountMasked: '6789', merchant: '카페', amount: 5000, transactionId: 'withdrawal', direction: 'withdrawal' as const },
      { source: 'bankCsv' as const, occurredAt: '2026-09-20T12:10:00+09:00', accountMasked: '6789', merchant: '지원금 입금', amount: 700000, transactionId: 'deposit', direction: 'deposit' as const },
      { source: 'bankCsv' as const, occurredAt: '2026-09-13T12:00:00+09:00', accountMasked: '6789', merchant: '기간 외 지출', amount: 5000, transactionId: 'outside', direction: 'withdrawal' as const },
    ];
    const result = importBankTransactions({ ...createInitialLedger(), entries: [] }, transactions, '6789', '2026-09');
    expect(result).toMatchObject({ imported: 1, undecided: 1, skipped: 2 });
    expect(result.ledger.entries).toEqual([expect.objectContaining({ merchant: '카페', status: 'undecided', cardLast4: '6789' })]);
  });
  it('round-trips the ledger through local storage', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
    const ledger = apply(createInitialLedger(), cafe5000, POLICY_MAX_LIMITS).ledger;
    saveLedger(storage, ledger);
    expect(loadLedger(storage)).toEqual(ledger);
  });
  it('updates and removes a ledger entry without affecting other entries', () => {
    const applied = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS);
    const updated = updateLedgerEntry(applied.ledger, applied.entry.id, { merchant: '수정 카페', amount: 7000, occurredAt: '2026-07-25T12:00:00+09:00', bucket: 'studySpace', category: 'generalCafe' });
    expect(updated.entries[0]).toMatchObject({ merchant: '수정 카페', amount: 7000, source: 'manual' });
    expect(removeLedgerEntry(updated, applied.entry.id).entries).toHaveLength(0);
  });
  it('moves an automatically classified payment back to undecided without changing its total history', () => {
    const applied = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS);
    const reverted = markAsUndecided(applied.ledger, applied.entry.id);
    expect(reverted.entries[0]).toMatchObject({ status: 'undecided', bucket: undefined, category: undefined });
    expect(getSummary(reverted, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(0);
    expect(reverted.entries[0]).toMatchObject({ merchant: cafe5000.merchant, amount: cafe5000.amount });
  });
  it('excludes only selected undecided expenses while retaining a reversible history record', () => {
    const first = saveAsUndecided({ ...createInitialLedger(), entries: [] }, { ...cafe5000, id: 'exclude-me' });
    const second = saveAsUndecided(first.ledger, { ...cafe5000, id: 'keep-me', merchant: '사업 결제' });
    const excluded = excludeUndecided(second.ledger, ['exclude-me']);
    expect(excluded.entries.find((entry) => entry.id === 'exclude-me')).toMatchObject({ status: 'excluded', bucket: undefined, category: undefined });
    expect(excluded.entries.find((entry) => entry.id === 'keep-me')).toMatchObject({ status: 'undecided' });
    expect(getHistoryEntries(excluded).map((entry) => entry.id)).toContain('exclude-me');
  });
  it('moves an undecided expense into a user-selected support item', () => {
    const saved = saveAsUndecided(createInitialLedger(), cafe5000);
    const result = reclassifyUndecided(saved.ledger, saved.entry.id, { bucket: 'resident', category: 'transport' }, POLICY_MAX_LIMITS);
    expect(result.entry).toMatchObject({ status: 'classified', bucket: 'resident', category: 'transport', source: 'manual' });
    expect(getSummary(result.ledger, 'resident', POLICY_MAX_LIMITS.resident).spent).toBe(220700);
  });
  it('keeps a memo and finds only nearby same-merchant same-amount duplicates', () => {
    const applied = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS);
    const updated = updateLedgerEntry(applied.ledger, applied.entry.id, { merchant: cafe5000.merchant, amount: 5000, occurredAt: cafe5000.occurredAt, bucket: 'studySpace', category: 'generalCafe', memo: '점심 스터디' });
    expect(updated.entries[0].memo).toBe('점심 스터디');
    expect(findSuspectedDuplicates(updated, { ...cafe5000, occurredAt: '2026-07-24T17:59:00+09:00' })).toHaveLength(1);
    expect(findSuspectedDuplicates(updated, { ...cafe5000, occurredAt: '2026-07-24T18:05:00+09:00' })).toHaveLength(0);
    expect(getHistoryEntries(updated).map((entry) => entry.id)).toEqual([updated.entries[0].id]);
  });
  it('matches a cancellation only when amount, merchant, and card all agree', () => {
    const approved = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS).ledger;
    const notice = { ...cafe5000, occurredAt: '2026-07-25T10:00:00+09:00' };
    expect(findCancellationCandidates(approved, notice)).toHaveLength(1);
    expect(getAutoCancellationMatch(approved, notice)?.id).toContain('2026-07-24');
    expect(getAutoCancellationMatch(approved, { ...notice, merchant: '다른 상호' })).toBeNull();
  });
  it('does not auto-cancel when two exact historical payments are possible', () => {
    const first = apply({ ...createInitialLedger(), entries: [] }, { ...cafe5000, id: 'first' }, POLICY_MAX_LIMITS);
    const second = apply(first.ledger, { ...cafe5000, id: 'second', occurredAt: '2026-07-24T18:58:00+09:00' }, POLICY_MAX_LIMITS);
    const notice = { ...cafe5000, occurredAt: '2026-07-25T10:00:00+09:00' };
    expect(findCancellationCandidates(second.ledger, notice)).toHaveLength(2);
    expect(getAutoCancellationMatch(second.ledger, notice)).toBeNull();
  });
  it('does not auto-cancel when only amount and merchant match but card differs', () => {
    const approved = apply({ ...createInitialLedger(), entries: [] }, cafe5000, POLICY_MAX_LIMITS).ledger;
    expect(getAutoCancellationMatch(approved, { ...cafe5000, cardLast4: '9999', occurredAt: '2026-07-25T10:00:00+09:00' })).toBeNull();
  });
  it('removes a confirmed cancellation from the affected budget without deleting its history', () => {
    const applied = apply(createInitialLedger(), cafe5000, POLICY_MAX_LIMITS);
    const cancelled = cancelPayment(applied.ledger, applied.entry.id, '2026-07-25T10:00:00+09:00');
    expect(cancelled.entries.find((entry) => entry.id === applied.entry.id)).toMatchObject({ status: 'cancelled', cancelledAt: '2026-07-25T10:00:00+09:00' });
    expect(getSummary(cancelled, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(77700);
  });
  it('reduces budget spending by only the cancelled amount for a partial cancellation', () => {
    const applied = apply({ ...createInitialLedger(), entries: [] }, { ...cafe5000, amount: 10000 }, POLICY_MAX_LIMITS);
    const partial = applyCancellation(applied.ledger, applied.entry.id, 3000, '2026-07-25T10:00:00+09:00');
    expect(partial.entries[0]).toMatchObject({ status: 'classified', amount: 10000, cancelledAmount: 3000 });
    expect(getSummary(partial, 'studySpace', POLICY_MAX_LIMITS.studySpace).spent).toBe(7000);
    expect(getAutoCancellationMatch(applied.ledger, { ...cafe5000, amount: 3000, occurredAt: '2026-07-25T10:00:00+09:00' })).toBeNull();
  });
});

it('shows recent payments by occurrence time instead of insertion order', () => {
  const ledger = createInitialLedger();
  ledger.entries = [
    { id: 'older', cardLast4: '3741', occurredAt: '2026-08-15T12:00:00+09:00', amount: 1, merchant: 'older', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
    { id: 'newer', cardLast4: '3741', occurredAt: '2026-08-18T12:00:00+09:00', amount: 1, merchant: 'newer', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
    { id: 'middle', cardLast4: '3741', occurredAt: '2026-08-16T12:00:00+09:00', amount: 1, merchant: 'middle', status: 'classified', bucket: 'resident', category: 'food', periodKey: '2026-08' },
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

describe('card import classification', () => {
  const cardRow = (merchant: string, approvalNumber: string) => ({ occurredAt: '2026-09-20T12:00:00+09:00', cardMasked: '000*', merchant, approvalNumber, amount: 9000, paymentStatus: '승인', cancellationStatus: '' });
  const rules = [createMerchantRule('테스트 카페', { bucket: 'studySpace', category: 'generalCafe' }, '2026-09-01T00:00:00.000Z')];
  const classify = (merchant: string) => classifyWithMerchantRules(merchant, rules);

  it('applies the user merchant rules to imported card payments', () => {
    const result = importCardTransactions(createEmptyLedger(), [cardRow('테스트 카페 강남점', '00000001'), cardRow('규칙 없는 가게', '00000002')], '0000', '2026-09', undefined, classify);
    expect(result.ledger.entries.map((entry) => [entry.merchant, entry.status, entry.category])).toEqual([
      ['테스트 카페 강남점', 'classified', 'generalCafe'],
      ['규칙 없는 가게', 'undecided', undefined],
    ]);
  });

  it('keeps the parsed classification when no classifier is given', () => {
    const result = importCardTransactions(createEmptyLedger(), [cardRow('테스트 카페 강남점', '00000001')], '0000', '2026-09');
    expect(result.ledger.entries[0].status).toBe('undecided');
  });

  it('leaves bank withdrawals as undecided candidates even when a rule matches', () => {
    const withdrawal = { source: 'bankCsv' as const, occurredAt: '2026-09-20T12:00:00+09:00', merchant: '테스트 카페 강남점', amount: 9000, transactionId: 't1', direction: 'withdrawal' as const, };
    expect(importBankTransactions(createEmptyLedger(), [withdrawal], '0000', '2026-09').ledger.entries[0].status).toBe('undecided');
  });
});
