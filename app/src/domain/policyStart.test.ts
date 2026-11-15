import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY_PERIOD, isDateInPolicyPeriod } from './budget';
import { isInPeriodScope, selectClassifiedInPeriod } from './periodSelectors';
import type { Ledger, LedgerEntry } from './ledger';
import { excludePaymentsBeforeDeposit, getDepositDateChoices, getPaymentsOnDate, getReinclusionCandidates, hasCountedPayments, includeBeforeDepositPayment, resolveDepositStart, restoreBeforeDeposit } from './policyStart';

const entry = (id: string, occurredAt: string, patch: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, cardLast4: '', occurredAt, merchant: `가맹점${id}`, amount: 1000, status: 'classified', bucket: 'resident', category: 'food', ...patch });
const ledger = (...entries: LedgerEntry[]): Ledger => ({ entries, alertThresholds: [50, 80] });

describe('deposit date choices', () => {
  it('offers the 11th through today and never a future date', () => {
    expect(getDepositDateChoices('2026-12', new Date('2026-12-13T09:00:00+09:00'))).toEqual({ buttons: ['2026-12-11', '2026-12-12', '2026-12-13'], calendar: null });
  });

  it('stops the buttons at the 16th and opens a calendar up to today after that', () => {
    expect(getDepositDateChoices('2026-12', new Date('2026-12-20T09:00:00+09:00'))).toEqual({
      buttons: ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14', '2026-12-15', '2026-12-16'],
      calendar: { min: '2026-12-11', max: '2026-12-20' },
    });
  });

  it('keeps the period start month after the month changes and ends on the 10th', () => {
    expect(getDepositDateChoices('2026-12', new Date('2027-01-03T09:00:00+09:00')).calendar).toEqual({ min: '2026-12-11', max: '2027-01-03' });
    expect(getDepositDateChoices('2026-12', new Date('2027-01-12T09:00:00+09:00')).calendar).toEqual({ min: '2026-12-11', max: '2027-01-10' });
  });
});

describe('deposit start', () => {
  const day = ledger(
    entry('late', '2026-12-13T15:10:00+09:00'),
    entry('early', '2026-12-13T09:00:00+09:00'),
    entry('cancelled', '2026-12-13T10:00:00+09:00', { status: 'cancelled' }),
    entry('other-day', '2026-12-12T09:00:00+09:00'),
  );

  it('lists the deposit date payments oldest first without cancelled ones', () => {
    expect(getPaymentsOnDate(day, '2026-12-13').map((item) => item.id)).toEqual(['early', 'late']);
  });

  it('starts at the chosen first payment', () => {
    expect(resolveDepositStart(day, '2026-12-13', { entryId: 'late' })).toEqual({ status: 'deposited', depositDate: '2026-12-13', startAt: new Date('2026-12-13T15:10:00+09:00').toISOString() });
  });

  it('starts after the last payment when every payment that day came before the deposit', () => {
    const funding = resolveDepositStart(day, '2026-12-13', 'none');
    expect(Date.parse(funding.startAt)).toBe(Date.parse('2026-12-13T15:10:00+09:00') + 1);
  });

  it('starts at the deposit date midnight when there is no payment that day', () => {
    expect(resolveDepositStart(day, '2026-12-14')).toEqual({ status: 'deposited', depositDate: '2026-12-14', startAt: '2026-12-14T00:00:00+09:00' });
  });

  it('counts payments only from the start in that period', () => {
    const period = { startDay: 11, endDay: 10, start: { periodKey: '2026-12', at: '2026-12-13T15:10:00+09:00' } };
    expect(isDateInPolicyPeriod(new Date('2026-12-13T09:00:00+09:00'), '2026-12', period)).toBe(false);
    expect(isDateInPolicyPeriod(new Date('2026-12-13T15:10:00+09:00'), '2026-12', period)).toBe(true);
    expect(isDateInPolicyPeriod(new Date('2027-01-10T23:00:00+09:00'), '2026-12', period)).toBe(true);
    expect(isDateInPolicyPeriod(new Date('2027-01-11T00:00:00+09:00'), '2026-12', period)).toBe(false);
  });

  it('counts nothing while the deposit is pending', () => {
    const period = { startDay: 11, endDay: 10, start: { periodKey: '2026-12', at: null } };
    expect(isDateInPolicyPeriod(new Date('2026-12-20T09:00:00+09:00'), '2026-12', period)).toBe(false);
  });
});

describe('payments before the deposit', () => {
  const funding = { status: 'deposited' as const, depositDate: '2026-12-13', startAt: '2026-12-13T12:00:00+09:00' };

  it('excludes earlier payments of the period as 사업 무관 and keeps their state', () => {
    const result = excludePaymentsBeforeDeposit(ledger(
      entry('gap', '2026-12-11T09:00:00+09:00'),
      entry('pending', '2026-12-13T09:00:00+09:00', { status: 'undecided', bucket: undefined, category: undefined }),
      entry('after', '2026-12-13T12:00:00+09:00'),
      entry('previous-period', '2026-12-09T09:00:00+09:00'),
    ), '2026-12', funding);
    expect(result.entries.map((item) => [item.id, item.status])).toEqual([['gap', 'excluded'], ['pending', 'excluded'], ['after', 'classified'], ['previous-period', 'classified']]);
    expect(result.entries[0].beforeDeposit).toEqual({ status: 'classified', bucket: 'resident', category: 'food' });
    expect(result.entries[1].beforeDeposit).toEqual({ status: 'undecided', bucket: undefined, category: undefined });
  });

  it('leaves deposit-date rows without a time for the user to classify', () => {
    const undecided = entry('bank', '2026-12-13T00:00:00+09:00', { status: 'undecided', bucket: undefined, category: undefined });
    expect(excludePaymentsBeforeDeposit(ledger(undecided), '2026-12', funding).entries[0]).toEqual(undecided);
  });

  it('does nothing while pending and returns the same ledger when nothing changes', () => {
    const current = ledger(entry('gap', '2026-12-11T09:00:00+09:00'));
    expect(excludePaymentsBeforeDeposit(current, '2026-12', { status: 'pending' })).toBe(current);
    const excluded = excludePaymentsBeforeDeposit(current, '2026-12', funding);
    expect(excludePaymentsBeforeDeposit(excluded, '2026-12', funding)).toBe(excluded);
  });

  it('asks about payments an earlier start brings back and restores the chosen ones', () => {
    const excluded = excludePaymentsBeforeDeposit(ledger(
      entry('food', '2026-12-12T09:00:00+09:00'),
      entry('unsorted', '2026-12-12T10:00:00+09:00', { status: 'undecided', bucket: undefined, category: undefined }),
      entry('manual', '2026-12-12T11:00:00+09:00', { status: 'excluded', bucket: undefined, category: undefined }),
    ), '2026-12', funding);
    const earlier = { status: 'deposited' as const, depositDate: '2026-12-12', startAt: '2026-12-12T00:00:00+09:00' };
    const candidates = getReinclusionCandidates(excluded, '2026-12', earlier);
    expect(candidates.map((item) => item.id)).toEqual(['food', 'unsorted', 'manual']);
    const restored = restoreBeforeDeposit(excluded, ['food', 'unsorted']);
    expect(restored.entries.map((item) => [item.id, item.status, item.category])).toEqual([['food', 'classified', 'food'], ['unsorted', 'undecided', undefined], ['manual', 'excluded', undefined]]);
    expect(restored.entries[2].beforeDeposit).toEqual({ status: 'excluded', bucket: undefined, category: undefined });
  });

  it('counts one payment before the deposit as it was and never leaves it out again', () => {
    const excluded = excludePaymentsBeforeDeposit(ledger(entry('gap', '2026-12-11T09:00:00+09:00'), entry('other', '2026-12-11T10:00:00+09:00')), '2026-12', funding);
    const included = includeBeforeDepositPayment(excluded, 'gap');
    expect(included.entries.map((item) => [item.id, item.status, item.category, item.includedBeforeDeposit])).toEqual([['gap', 'classified', 'food', true], ['other', 'excluded', undefined, undefined]]);
    expect(excludePaymentsBeforeDeposit(included, '2026-12', funding)).toBe(included);
    expect(includeBeforeDepositPayment(included, 'missing')).toBe(included);
    // It counts in this period although it is before the deposit start; the other one still does not.
    const scope = { periodKey: '2026-12', period: { ...DEFAULT_POLICY_PERIOD, start: { periodKey: '2026-12', at: funding.startAt } } };
    expect(selectClassifiedInPeriod(included, scope).map((item) => item.id)).toEqual(['gap']);
    expect(isInPeriodScope(included.entries[1], scope)).toBe(false);
  });

  it('tells whether any payment already counts', () => {
    const current = ledger(entry('a', '2026-11-20T09:00:00+09:00'), entry('b', '2026-11-21T09:00:00+09:00', { status: 'undecided' }));
    expect(hasCountedPayments(current, (item) => item.id === 'a')).toBe(true);
    expect(hasCountedPayments(current, (item) => item.id === 'b')).toBe(false);
  });
});
