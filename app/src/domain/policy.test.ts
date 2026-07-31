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
  it('maps OCR table values by expected-amount row order instead of nearby labels', () => {
    const ocr = `구분 정주비 (50만원) 학습공간 지원비 합계 (20만원) 정주비 소계 학습공간 지원비 소계 주거비 식비 교육비 교통비 스터디카페 카페 독서실 사용처 숙박비 식비 직접입력 고속열차 및 유류비 직접입력 학습공간 직접입력 예상금액 50,000 200,000 원원 250,000 원 원 0 원 0 200,000 원 700,000 원 500,000 원 200,000 원 비율 10 40 50 % 100 %`;
    const policy = parsePolicyText(ocr);
    expect(policy.plans.resident).toMatchObject({ lodging: 50000, food: 200000, transport: 250000 });
    expect(policy.plans.studySpace.generalCafe).toBe(200000);
    expect(getPolicyLimit(policy, 'resident')).toBe(500000);
    expect(getPolicyLimit(policy, 'studySpace')).toBe(200000);
  });
});