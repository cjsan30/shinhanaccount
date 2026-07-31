import { describe, expect, it } from 'vitest';
import { getPolicyLimit, parsePolicyText } from './policy';

describe('policy text import', () => {
  it('extracts the submitted category plans from copied table text', () => {
    const policy = parsePolicyText('정주비 숙박비 50,000원 식비 200,000원 교통비 250,000원 학습공간 지원비 카페 200,000원');
    expect(policy.plans.resident).toMatchObject({ lodging: 50000, food: 200000, transport: 250000 });
    expect(policy.plans.studySpace.generalCafe).toBe(200000);
    expect(getPolicyLimit(policy, 'resident')).toBe(500000);
  });

  it('keeps the default value when a category cannot be read', () => {
    expect(parsePolicyText('식비 120,000원').plans.resident).toMatchObject({ lodging: 50000, food: 120000, transport: 250000 });
  });
});