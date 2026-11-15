export const POLICY_MAX_LIMITS = {
  resident: 500_000,
  studySpace: 200_000,
} as const;

export const DEFAULT_ALERT_THRESHOLDS = [50, 80] as const;

export type BudgetKey = keyof typeof POLICY_MAX_LIMITS;

export type BudgetSummary = {
  limit: number;
  spent: number;
  remaining: number;
  usagePercent: number;
};

export function roundUsagePercent(spent: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.round((Math.max(0, spent) * 1000) / limit) / 10;
}

function getKoreaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);

  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: valueOf('year'),
    month: valueOf('month'),
    day: valueOf('day'),
  };
}

/**
 * A policy period is keyed by the month in which it can start. Since 2026-11 the
 * end is fixed to the 10th of the next month and the start is the moment the
 * subsidy was deposited (on or after the 11th), chosen by the user. `start` is
 * that moment for one period key: `at: null` means the plan is confirmed but the
 * subsidy has not arrived, so nothing counts yet.
 */
export type PeriodStart = { periodKey: string; at: string | null };
export type PolicyPeriod = { startDay: number; endDay: number; start?: PeriodStart };
/** Earliest day a period can start; payments from this day wait for the deposit. */
export const PERIOD_OPEN_DAY = 11;
export const PERIOD_END_DAY = 10;
export const DEFAULT_POLICY_PERIOD: PolicyPeriod = { startDay: PERIOD_OPEN_DAY, endDay: PERIOD_END_DAY };
/** Custom start/end days were removed (2026-11-15); only the deposit start is kept. */
export function normalizePolicyPeriod(value?: Partial<PolicyPeriod>): PolicyPeriod {
  const start = value?.start;
  const validStart = start && /^\d{4}-\d{2}$/.test(start.periodKey) && (start.at === null || Number.isFinite(Date.parse(start.at)));
  return { ...DEFAULT_POLICY_PERIOD, ...(validStart ? { start: { periodKey: start.periodKey, at: start.at } } : {}) };
}
const pad = (value: number) => String(value).padStart(2, '0');
/** Korea calendar date (YYYY-MM-DD) of an instant. */
export function koreaDate(date: Date) {
  const { year, month, day } = getKoreaDateParts(date);
  return `${year}-${pad(month)}-${pad(day)}`;
}
/** The first day the period can open and its fixed last day, before any deposit. */
export function getPeriodBounds(periodKey: string) {
  const [year, month] = periodKey.split('-').map(Number);
  if (!/^\d{4}-\d{2}$/.test(periodKey) || month < 1 || month > 12) return { open: '', end: '' };
  const endMonth = new Date(Date.UTC(year, month, 1));
  return { open: `${year}-${pad(month)}-${pad(PERIOD_OPEN_DAY)}`, end: `${endMonth.getUTCFullYear()}-${pad(endMonth.getUTCMonth() + 1)}-${pad(PERIOD_END_DAY)}` };
}
/** Display range: starts on the deposit date once it is known. */
export function getPolicyPeriodRange(periodKey: string, period?: PolicyPeriod) {
  const { open, end } = getPeriodBounds(periodKey);
  if (!open) return { start: '', end: '' };
  const start = period?.start?.periodKey === periodKey && period.start.at ? koreaDate(new Date(period.start.at)) : open;
  return { start, end };
}
export function getPolicyPeriodKey(date: Date, _period?: PolicyPeriod): string {
  const { year, month, day } = getKoreaDateParts(date);
  const periodStart = day >= PERIOD_OPEN_DAY ? { year, month } : month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return `${periodStart.year}-${pad(periodStart.month)}`;
}

/**
 * Dates sent to the native listener, which only compares calendar dates. While the deposit is
 * pending (or no plan exists) the start lies after the end, so no immediate alert is raised.
 */
export function getNativeAlertRange(periodKey: string, period?: PolicyPeriod) {
  const { start, end } = getPolicyPeriodRange(periodKey, period);
  const pending = period?.start?.periodKey === periodKey && period.start.at === null;
  return { periodStart: pending ? '9999-12-31' : start, periodEnd: end };
}

/** A payment counts only inside the bounds and, for the deposit's period, from the deposit on. */
export function isDateInPolicyPeriod(date: Date, periodKey?: string, period?: PolicyPeriod): boolean {
  if (!Number.isFinite(date.getTime())) return false;
  const key = periodKey ?? getPolicyPeriodKey(date, period);
  const { open, end } = getPeriodBounds(key);
  const value = koreaDate(date);
  if (!open || value < open || value > end) return false;
  if (period?.start?.periodKey !== key) return true;
  return period.start.at !== null && date.getTime() >= Date.parse(period.start.at);
}

export function calculateBudgetSummary(limit: number, spent: number): BudgetSummary {
  const safeSpent = Math.max(0, spent);

  return {
    limit,
    spent: safeSpent,
    remaining: limit - safeSpent,
    usagePercent: roundUsagePercent(safeSpent, limit),
  };
}

export function getCrossedAlertThresholds(
  previousSpent: number,
  currentSpent: number,
  limit: number,
  thresholds: readonly number[] = DEFAULT_ALERT_THRESHOLDS,
): number[] {
  if (limit <= 0 || currentSpent <= previousSpent) return [];

  return thresholds.filter((threshold) => {
    const amount = (limit * threshold) / 100;
    return previousSpent < amount && currentSpent >= amount;
  });
}

export function clampAlertThreshold(index: 0 | 1, value: number, thresholds: [number, number]): [number, number] {
  const [first, second] = thresholds;
  const normalized = Math.max(1, Math.min(99, Math.round(value)));
  return index === 0
    ? [Math.min(normalized, second - 1), second]
    : [first, Math.max(normalized, first + 1)];
}
