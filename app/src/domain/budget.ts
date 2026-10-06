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

export type PolicyPeriod = { startDay: number; endDay: number };
export const DEFAULT_POLICY_PERIOD: PolicyPeriod = { startDay: 15, endDay: 10 };
export function normalizePolicyPeriod(value?: Partial<PolicyPeriod>): PolicyPeriod {
  const valid = (day: unknown) => typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;
  return valid(value?.startDay) && valid(value?.endDay) ? { startDay: value!.startDay!, endDay: value!.endDay! } : { ...DEFAULT_POLICY_PERIOD };
}
const monthDay = (year: number, month: number, day: number) => Math.min(day, new Date(Date.UTC(year, month, 0)).getUTCDate());
export function getPolicyPeriodRange(periodKey: string, period?: PolicyPeriod) {
  const { startDay, endDay } = normalizePolicyPeriod(period);
  const [year, month] = periodKey.split('-').map(Number);
  if (!/^\d{4}-\d{2}$/.test(periodKey) || month < 1 || month > 12) return { start: '', end: '' };
  const endMonth = new Date(Date.UTC(year, month - 1 + (endDay < startDay ? 1 : 0), 1));
  const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(monthDay(y, m, d)).padStart(2, '0')}`;
  return { start: iso(year, month, startDay), end: iso(endMonth.getUTCFullYear(), endMonth.getUTCMonth() + 1, endDay) };
}
export function getPolicyPeriodKey(date: Date, period?: PolicyPeriod): string {
  const { year, month, day } = getKoreaDateParts(date);
  const periodStart = day >= monthDay(year, month, normalizePolicyPeriod(period).startDay) ? { year, month } : month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  return `${periodStart.year}-${String(periodStart.month).padStart(2, '0')}`;
}

export function isDateInPolicyPeriod(date: Date, periodKey?: string, period?: PolicyPeriod): boolean {
  if (!Number.isFinite(date.getTime())) return false;
  const { year, month, day } = getKoreaDateParts(date);
  const value = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const range = getPolicyPeriodRange(periodKey ?? getPolicyPeriodKey(date, period), period);
  return Boolean(range.start) && value >= range.start && value <= range.end;
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
