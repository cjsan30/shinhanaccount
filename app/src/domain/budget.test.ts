import { describe, expect, it } from 'vitest';
import {
  POLICY_MAX_LIMITS,
  calculateBudgetSummary,
  getCrossedAlertThresholds,
  getPolicyPeriodKey,
  roundUsagePercent,
} from './budget';

describe('policy period', () => {
  it('starts a new policy period at 00:00 Korea time on the 10th', () => {
    expect(getPolicyPeriodKey(new Date('2026-08-09T14:59:59.000Z'))).toBe('2026-07');
    expect(getPolicyPeriodKey(new Date('2026-08-09T15:00:00.000Z'))).toBe('2026-08');
  });

  it('uses December of the previous year before January 10th', () => {
    expect(getPolicyPeriodKey(new Date('2026-01-05T03:00:00.000Z'))).toBe('2025-12');
  });
});

describe('usage percentage rounding', () => {
  it('rounds half up to one decimal like the Android widget', () => {
    expect(roundUsagePercent(23_700, 200_000)).toBe(11.9);
    expect(roundUsagePercent(23_680, 200_000)).toBe(11.8);
    expect(roundUsagePercent(10, 0)).toBe(0);
  });
});

describe('budget summary', () => {
  it('calculates the two fixed support limits independently', () => {
    expect(POLICY_MAX_LIMITS).toEqual({ resident: 500_000, studySpace: 200_000 });
    expect(calculateBudgetSummary(POLICY_MAX_LIMITS.resident, 215_700)).toMatchObject({
      remaining: 284_300,
      usagePercent: 43.1,
    });
  });

  it('keeps over-limit spending visible as a negative remaining amount', () => {
    expect(calculateBudgetSummary(50_000, 60_000)).toMatchObject({
      remaining: -10_000,
      usagePercent: 120,
    });
  });

  it('does not permit a negative spent amount or a percentage for a zero limit', () => {
    expect(calculateBudgetSummary(0, -1_000)).toMatchObject({
      spent: 0,
      remaining: 0,
      usagePercent: 0,
    });
  });
});

describe('alert thresholds', () => {
  it('reports only thresholds crossed by the new spending', () => {
    expect(getCrossedAlertThresholds(240_000, 260_000, POLICY_MAX_LIMITS.resident)).toEqual([50]);
    expect(getCrossedAlertThresholds(260_000, 410_000, POLICY_MAX_LIMITS.resident)).toEqual([80]);
  });

  it('does not repeat an alert after its threshold was already crossed', () => {
    expect(getCrossedAlertThresholds(260_000, 270_000, POLICY_MAX_LIMITS.resident)).toEqual([]);
  });

  it('does not produce alerts when spending did not increase or the limit is invalid', () => {
    expect(getCrossedAlertThresholds(10_000, 10_000, POLICY_MAX_LIMITS.resident)).toEqual([]);
    expect(getCrossedAlertThresholds(0, 10_000, 0)).toEqual([]);
  });
});
