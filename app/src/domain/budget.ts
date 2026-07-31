export const BUDGET_LIMITS = {
  resident: 500_000,
  studySpace: 200_000,
} as const;

export const DEFAULT_ALERT_THRESHOLDS = [50, 80] as const;

export type BudgetKey = keyof typeof BUDGET_LIMITS;

export type BudgetSummary = {
  limit: number;
  spent: number;
  remaining: number;
  usagePercent: number;
};

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

export function getPolicyPeriodKey(date: Date): string {
  const { year, month, day } = getKoreaDateParts(date);
  const periodStart = day >= 10 ? { year, month } : month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };

  return `${periodStart.year}-${String(periodStart.month).padStart(2, '0')}`;
}

export function calculateBudgetSummary(limit: number, spent: number): BudgetSummary {
  const safeSpent = Math.max(0, spent);

  return {
    limit,
    spent: safeSpent,
    remaining: limit - safeSpent,
    usagePercent: limit === 0 ? 0 : (safeSpent / limit) * 100,
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