import { getPeriodBounds, koreaDate } from './budget';
import type { Ledger, LedgerEntry } from './ledger';
import type { PolicyFunding } from './policy';

/** Deposit date buttons stop at this day; later dates are chosen from a calendar. */
export const DEPOSIT_BUTTON_LAST_DAY = 16;

/**
 * Dates the user may pick as the deposit date: from the 11th up to today (never the
 * future). After the 16th the buttons stop at the 16th and a calendar covers the rest.
 */
export function getDepositDateChoices(periodKey: string, now: Date) {
  const { open, end } = getPeriodBounds(periodKey);
  const today = koreaDate(now);
  const max = today < end ? today : end;
  if (!open || max < open) return { buttons: [] as string[], calendar: null as null | { min: string; max: string } };
  const buttons: string[] = [];
  const [year, month] = periodKey.split('-').map(Number);
  for (let day = 11; day <= DEPOSIT_BUTTON_LAST_DAY; day += 1) {
    const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (value <= max) buttons.push(value);
  }
  const lastButton = buttons.at(-1) ?? open;
  return { buttons, calendar: max > lastButton ? { min: open, max } : null };
}

const countable = (entry: LedgerEntry) => entry.status !== 'cancelled';
/** Payments on the deposit date, oldest first, for choosing the first one after the deposit. */
export function getPaymentsOnDate(ledger: Ledger, date: string) {
  return ledger.entries
    .filter((entry) => countable(entry) && koreaDate(new Date(entry.occurredAt)) === date)
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

/** `first` is the chosen payment, `'none'` means every payment that day was before the deposit. */
export type FirstPaymentChoice = { entryId: string } | 'none';
export function resolveDepositStart(ledger: Ledger, depositDate: string, choice?: FirstPaymentChoice): Extract<PolicyFunding, { status: 'deposited' }> {
  const midnight = `${depositDate}T00:00:00+09:00`;
  const payments = getPaymentsOnDate(ledger, depositDate);
  if (!payments.length || !choice) return { status: 'deposited', depositDate, startAt: midnight };
  if (choice === 'none') {
    const last = payments.at(-1)!;
    return { status: 'deposited', depositDate, startAt: new Date(Date.parse(last.occurredAt) + 1).toISOString() };
  }
  const first = payments.find((entry) => entry.id === choice.entryId);
  return { status: 'deposited', depositDate, startAt: first ? new Date(first.occurredAt).toISOString() : midnight };
}

/** Bank files without a time column arrive at midnight; on the deposit date their order is unknown. */
function hasUnknownTime(entry: LedgerEntry, depositDate: string) {
  const date = new Date(entry.occurredAt);
  return koreaDate(date) === depositDate && date.getTime() === Date.parse(`${depositDate}T00:00:00+09:00`);
}

function inPeriodBounds(entry: LedgerEntry, periodKey: string) {
  const { open, end } = getPeriodBounds(periodKey);
  const date = koreaDate(new Date(entry.occurredAt));
  return Boolean(open) && date >= open && date <= end;
}

/**
 * Excludes every payment of the period made before the deposit as 사업 무관 while
 * keeping its earlier state, so moving the deposit date later can bring it back.
 * Payments already excluded this way, and deposit-date payments without a time
 * (imported 분류 필요 rows whose order is unknown), are left alone. Safe to run on every change.
 */
export function excludePaymentsBeforeDeposit(ledger: Ledger, periodKey: string, funding: PolicyFunding | undefined): Ledger {
  if (funding?.status !== 'deposited') return ledger;
  const start = Date.parse(funding.startAt);
  let changed = false;
  const entries = ledger.entries.map((entry) => {
    if (!countable(entry) || entry.beforeDeposit || !inPeriodBounds(entry, periodKey) || Date.parse(entry.occurredAt) >= start) return entry;
    // Imported bank rows are 분류 필요 already; the user decides them like any other.
    if (hasUnknownTime(entry, funding.depositDate)) return entry;
    changed = true;
    return { ...entry, status: 'excluded' as const, bucket: undefined, category: undefined, beforeDeposit: { status: entry.status, bucket: entry.bucket, category: entry.category } };
  });
  return changed ? { ...ledger, entries } : ledger;
}

/** Payments that a new, earlier deposit start brings back into the period; the user decides. */
export function getReinclusionCandidates(ledger: Ledger, periodKey: string, funding: PolicyFunding) {
  if (funding.status !== 'deposited') return [];
  const start = Date.parse(funding.startAt);
  return ledger.entries
    .filter((entry) => entry.beforeDeposit && inPeriodBounds(entry, periodKey) && Date.parse(entry.occurredAt) >= start)
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

/** Restores the chosen payments to the state they had before they were excluded. */
export function restoreBeforeDeposit(ledger: Ledger, entryIds: string[]): Ledger {
  const ids = new Set(entryIds);
  if (!ids.size) return ledger;
  return {
    ...ledger,
    entries: ledger.entries.map((entry) => {
      if (!ids.has(entry.id) || !entry.beforeDeposit) return entry;
      const { status, bucket, category } = entry.beforeDeposit;
      const restored = { ...entry, beforeDeposit: undefined, status, bucket, category };
      return status === 'classified' && !(bucket && category) ? { ...restored, status: 'undecided' as const } : restored;
    }),
  };
}

/** Whether anything already counts in the period: then an old plan is kept without asking. */
export function hasCountedPayments(ledger: Ledger, isInPeriod: (entry: LedgerEntry) => boolean) {
  return ledger.entries.some((entry) => entry.status === 'classified' && isInPeriod(entry));
}
