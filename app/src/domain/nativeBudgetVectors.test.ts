import { describe, expect, it } from 'vitest';
import { getCrossedAlertThresholds, getPolicyPeriodRange, isDateInPolicyPeriod, type PolicyPeriod } from './budget';
import { buildNativeRuleSnapshot, classifyWithMerchantRules, createMerchantRule, type MerchantMatchMode } from './merchantRules';
import { POLICY_ITEMS } from './policy';
import vectors from './nativeBudgetVectors.json';

// The Android unit test NativeBudgetVectorsTest.kt reads the same file. These tests make sure
// every expected value there is what the TypeScript rules produce.
describe('shared native budget vectors', () => {
  it.each(vectors.period)('period: $name', ({ occurredAt, periodKey, period, periodStart, periodEnd, inPeriod }) => {
    expect(getPolicyPeriodRange(periodKey, period as PolicyPeriod)).toEqual({ start: periodStart, end: periodEnd });
    expect(isDateInPolicyPeriod(new Date(occurredAt), periodKey, period as PolicyPeriod)).toBe(inPeriod);
  });

  const rules = vectors.rules.input.map(({ merchant, matchMode, bucket, category, createdAt }) =>
    createMerchantRule(merchant, { bucket: bucket as 'resident' | 'studySpace', category }, createdAt, matchMode as MerchantMatchMode));

  it('rules: the snapshot sent to native code', () => {
    expect(buildNativeRuleSnapshot(rules, POLICY_ITEMS)).toEqual(vectors.rules.snapshot);
  });

  it.each(vectors.rules.payments)('rules: $name', ({ merchant, category }) => {
    const classification = classifyWithMerchantRules(merchant, rules);
    const item = classification.status === 'classified'
      ? POLICY_ITEMS.find((candidate) => candidate.bucket === classification.bucket && candidate.ledgerCategories.includes(classification.category))
      : undefined;
    expect(item ? classification.status === 'classified' && classification.category : '').toBe(category);
  });

  it.each(vectors.thresholds)('thresholds: $name', ({ limit, previous, amount, thresholds, crossed }) => {
    expect(getCrossedAlertThresholds(previous, previous + amount, limit, thresholds)).toEqual(crossed);
  });
});
