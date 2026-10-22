import { getPolicyPeriodKey, getPolicyPeriodRange, type BudgetKey, type PolicyPeriod } from './budget';
import { getCategorySpent, getSpent, getSupportAmount, isEntryInPolicyPeriod, type Ledger, type LedgerEntry } from './ledger';
import type { AnyPolicyItemDefinition } from './policy';

/**
 * Every screen that totals "this period" passes the same scope through these
 * selectors so the dashboard, report, widget, budget alerts and notification
 * sync can never disagree about which payments count.
 */
export type PeriodScope = { periodKey: string; period?: PolicyPeriod };

export type ItemUsage = { item: AnyPolicyItemDefinition; spent: number; count: number };

export function isInPeriodScope(value: { occurredAt: string }, scope: PeriodScope) {
  return isEntryInPolicyPeriod(value, scope.periodKey, scope.period);
}

/** Queued records without a date are kept so the user can still review them. */
export function selectInPeriodScope<T extends { occurredAt?: string }>(items: T[], scope: PeriodScope) {
  return items.filter((item) => !item.occurredAt || isInPeriodScope({ occurredAt: item.occurredAt }, scope));
}

export function getCurrentPeriodRange(now: Date, period?: PolicyPeriod) {
  return getPolicyPeriodRange(getPolicyPeriodKey(now, period), period);
}

export function selectClassifiedInPeriod(ledger: Ledger, scope: PeriodScope): LedgerEntry[] {
  return ledger.entries.filter((entry) => entry.status === 'classified' && isInPeriodScope(entry, scope));
}

export function sumSupportAmounts(entries: LedgerEntry[]) {
  return entries.reduce((sum, entry) => sum + getSupportAmount(entry), 0);
}

export function selectSpentByBucket(ledger: Ledger, scope: PeriodScope): Record<BudgetKey, number> {
  return { resident: getSpent(ledger, 'resident', scope.periodKey, scope.period), studySpace: getSpent(ledger, 'studySpace', scope.periodKey, scope.period) };
}

/** Spending per ledger category, counted only within the item's own bucket. */
export function selectSpentByCategory(ledger: Ledger, items: AnyPolicyItemDefinition[], scope: PeriodScope): Record<string, number> {
  return Object.fromEntries(items.flatMap((item) => item.ledgerCategories.map((category) => [category, getCategorySpent(ledger, item.bucket, category, scope.periodKey, scope.period)])));
}

/** A payment belongs to an item only when both its bucket and category match. */
export function selectItemUsage(ledger: Ledger, items: AnyPolicyItemDefinition[], scope: PeriodScope): ItemUsage[] {
  const classified = selectClassifiedInPeriod(ledger, scope);
  return items.map((item) => {
    const entries = classified.filter((entry) => entry.bucket === item.bucket && item.ledgerCategories.includes(String(entry.category)));
    return { item, spent: sumSupportAmounts(entries), count: entries.length };
  });
}

/** Newest first; entries outside the scope are earlier periods or the policy gap. */
export function selectUndecidedByPeriod(ledger: Ledger, scope: PeriodScope) {
  const undecided = ledger.entries
    .filter((entry) => entry.status === 'undecided')
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return {
    current: undecided.filter((entry) => isInPeriodScope(entry, scope)),
    previous: undecided.filter((entry) => !isInPeriodScope(entry, scope)),
  };
}

export type ImportDatedRecord = { occurredAt: string };

export function filterImportToPolicyPeriod<T extends ImportDatedRecord>(records: T[], periodKey: string, period?: PolicyPeriod) {
  const included = records.filter((record) => isInPeriodScope(record, { periodKey, period }));
  return { included, excludedOutsidePeriod: records.length - included.length };
}
