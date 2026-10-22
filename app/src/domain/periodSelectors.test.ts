import { describe, expect, it } from 'vitest';
import type { Ledger, LedgerEntry } from './ledger';
import { getPolicyItems } from './policy';
import {
  filterImportToPolicyPeriod,
  getCurrentPeriodRange,
  isInPeriodScope,
  selectClassifiedInPeriod,
  selectInPeriodScope,
  selectItemUsage,
  selectSpentByBucket,
  selectSpentByCategory,
  selectUndecidedByPeriod,
  sumSupportAmounts,
} from './periodSelectors';

const scope = { periodKey: '2026-09' };
const entry = (id: string, occurredAt: string, patch: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, occurredAt, amount: 10000, merchant: id, cardLast4: '0000', status: 'classified', bucket: 'resident', category: 'food', ...patch });
const ledger = (...entries: LedgerEntry[]): Ledger => ({ entries, alertThresholds: [50, 80] });
const items = getPolicyItems({ customItems: [{ id: 'gym', label: '운동비', bucket: 'studySpace', amount: 100000 }] });

describe('period selectors', () => {
  it('uses the policy period edges and excludes the gap between periods', () => {
    expect(isInPeriodScope({ occurredAt: '2026-09-15T00:00:00+09:00' }, scope)).toBe(true);
    expect(isInPeriodScope({ occurredAt: '2026-10-10T23:59:00+09:00' }, scope)).toBe(true);
    expect(isInPeriodScope({ occurredAt: '2026-10-12T12:00:00+09:00' }, scope)).toBe(false);
    expect(isInPeriodScope({ occurredAt: '2026-09-14T23:59:00+09:00' }, scope)).toBe(false);
  });

  it('honours a custom policy period', () => {
    const custom = { periodKey: '2026-09', period: { startDay: 1, endDay: 30 } };
    expect(isInPeriodScope({ occurredAt: '2026-09-01T00:00:00+09:00' }, custom)).toBe(true);
    expect(isInPeriodScope({ occurredAt: '2026-10-01T00:00:00+09:00' }, custom)).toBe(false);
  });

  it('keeps undated queued records and drops dated ones outside the period', () => {
    const queued = [{ id: 'undated' }, { id: 'inside', occurredAt: '2026-09-20T12:00:00+09:00' }, { id: 'gap', occurredAt: '2026-10-12T12:00:00+09:00' }];
    expect(selectInPeriodScope(queued, scope).map((item) => item.id)).toEqual(['undated', 'inside']);
  });

  it('derives the current period range from the given now', () => {
    expect(getCurrentPeriodRange(new Date('2026-10-12T12:00:00+09:00'))).toEqual({ start: '2026-09-15', end: '2026-10-10' });
    expect(getCurrentPeriodRange(new Date('2026-10-15T00:00:00+09:00'))).toEqual({ start: '2026-10-15', end: '2026-11-10' });
    expect(getCurrentPeriodRange(new Date('2027-01-05T12:00:00+09:00'))).toEqual({ start: '2026-12-15', end: '2027-01-10' });
  });

  it('counts only classified payments in the period by their support amount', () => {
    const data = ledger(
      entry('full', '2026-09-20T12:00:00+09:00'),
      entry('partial', '2026-09-21T12:00:00+09:00', { amount: 50000, supportAmount: 30000 }),
      entry('cancelled-part', '2026-09-22T12:00:00+09:00', { amount: 20000, cancelledAmount: 5000 }),
      entry('undecided', '2026-09-23T12:00:00+09:00', { status: 'undecided' }),
      entry('cancelled', '2026-09-24T12:00:00+09:00', { status: 'cancelled' }),
      entry('old', '2026-08-20T12:00:00+09:00'),
    );
    const classified = selectClassifiedInPeriod(data, scope);
    expect(classified.map((item) => item.id)).toEqual(['full', 'partial', 'cancelled-part']);
    expect(sumSupportAmounts(classified)).toBe(10000 + 30000 + 15000);
  });

  it('keeps bucket totals equal to the sum of their items', () => {
    const data = ledger(
      entry('food', '2026-09-20T12:00:00+09:00'),
      entry('transport', '2026-09-20T13:00:00+09:00', { category: 'transport', amount: 5000 }),
      entry('cafe', '2026-09-20T14:00:00+09:00', { bucket: 'studySpace', category: 'generalCafe', amount: 4000 }),
      entry('gym', '2026-09-20T15:00:00+09:00', { bucket: 'studySpace', category: 'custom:gym', amount: 7000 }),
    );
    const byBucket = selectSpentByBucket(data, scope);
    const usage = selectItemUsage(data, items, scope);
    const sumFor = (bucket: string) => usage.filter((row) => row.item.bucket === bucket).reduce((sum, row) => sum + row.spent, 0);
    expect(byBucket).toEqual({ resident: 15000, studySpace: 11000 });
    expect(sumFor('resident')).toBe(byBucket.resident);
    expect(sumFor('studySpace')).toBe(byBucket.studySpace);
  });

  it('does not count a payment whose bucket no longer matches its item', () => {
    // Classified while the custom item still belonged to 정주비.
    const data = ledger(entry('gym-before-move', '2026-09-20T12:00:00+09:00', { bucket: 'resident', category: 'custom:gym', amount: 30000 }));
    const gym = selectItemUsage(data, items, scope).find((row) => row.item.key === 'gym');
    expect(gym).toMatchObject({ spent: 0, count: 0 });
    expect(selectSpentByCategory(data, items, scope)['custom:gym']).toBe(0);
    expect(selectSpentByBucket(data, scope).resident).toBe(30000);
  });

  it('reports per-category spending and item counts for every policy item', () => {
    const data = ledger(entry('food-1', '2026-09-20T12:00:00+09:00'), entry('food-2', '2026-09-21T12:00:00+09:00', { amount: 2500 }));
    expect(selectSpentByCategory(data, items, scope)).toMatchObject({ food: 12500, transport: 0, 'custom:gym': 0 });
    expect(selectItemUsage(data, items, scope).find((row) => row.item.key === 'food')).toMatchObject({ spent: 12500, count: 2 });
  });

  it('splits undecided payments into the current period and earlier ones, newest first', () => {
    const data = ledger(
      entry('current-old', '2026-09-16T12:00:00+09:00', { status: 'undecided' }),
      entry('current-new', '2026-09-30T12:00:00+09:00', { status: 'undecided' }),
      entry('gap', '2026-10-12T12:00:00+09:00', { status: 'undecided' }),
      entry('previous', '2026-08-20T12:00:00+09:00', { status: 'undecided' }),
      entry('classified', '2026-09-20T12:00:00+09:00'),
    );
    const split = selectUndecidedByPeriod(data, scope);
    expect(split.current.map((item) => item.id)).toEqual(['current-new', 'current-old']);
    expect(split.previous.map((item) => item.id)).toEqual(['gap', 'previous']);
  });
});

describe('import period filtering', () => {
  it('does not retain entries outside the active 15th-to-10th policy period', () => {
    const result = filterImportToPolicyPeriod([
      { occurredAt: '2026-09-15T12:00:00+09:00' },
      { occurredAt: '2026-10-10T23:59:00+09:00' },
      { occurredAt: '2026-09-13T12:00:00+09:00' },
      { occurredAt: '2026-09-14T12:00:00+09:00' },
      { occurredAt: '2026-10-11T00:00:00+09:00' },
    ], '2026-09');
    expect(result.included).toHaveLength(2);
    expect(result.excludedOutsidePeriod).toBe(3);
  });
});
