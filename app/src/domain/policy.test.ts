import { describe, expect, it } from 'vitest';
import { confirmPolicyForPeriod, createPolicyBook, getEffectivePolicy, getNextPolicyPeriodKey, getPolicyLimit, parsePolicyText } from './policy';

describe('policy text import', () => {
  it('keeps the current policy stable and schedules a confirmed policy for the next period', () => {
    const now = new Date('2026-08-01T12:00:00+09:00');
    const book = createPolicyBook(parsePolicyText('숙박비 50,000원 식비 200,000원 교통비 250,000원 카페 200,000원'), now);
    const scheduled = { ...getEffectivePolicy(book, now).policy, plans: { ...getEffectivePolicy(book, now).policy.plans, housing: 100000 } };
    const nextBook = confirmPolicyForPeriod(book, scheduled, getNextPolicyPeriodKey(now));
    expect(getEffectivePolicy(nextBook, now).policy.plans.housing).toBe(50000);
    expect(getEffectivePolicy(nextBook, new Date('2026-08-10T00:00:00+09:00')).policy.plans.housing).toBe(100000);
  });

  it('maps pasted rows by support item and ignores the user-defined usage name', () => {
    const copied = `구분\t사용처\t예상금액\t비율\n정주비\n(50만원)\t주거비\t\n숙박비\n50,000\n 원\t\n10\n %\n식비\t\n식비\n200,000\n 원\t\n40\n %\n교육비\t\n직접입력\n0\n 원\t\n0\n %\n교통비\t\n고속열차 및 유류비\n250,000\n 원\t\n50\n %\n학습공간 지원비\n(20만원)\t스터디카페\t\n직접입력\n0\n 원\t\n0\n %\n카페\t\n학습공간\n200,000\n 원\t\n100\n %\n독서실\t\n직접입력\n0\n 원\t\n0\n %`;
    const policy = parsePolicyText(copied);
    expect(policy.plans).toMatchObject({ housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 });
    expect(getPolicyLimit(policy, 'resident')).toBe(500000);
  });

  it('recovers item amounts from real OCR rows when units or zero values are omitted', () => {
    const ocr = [
      '구분 사용처 예상금액 비율',
      '주거비 숙박비 50,000 10',
      '정주비 식비 식비 200,000 원원 40 %',
      '(50만원) 교육비 직접입력 원 %',
      '교통비 고속열차 및 유류비 250,000 원 50 %',
      '스터디카페 직접입력 0 원 %',
      '학습공간 지원비 (20만원) 카페 학습공간 200,000 원 100 %',
      '독서실 직접입력 0 원 %',
      '정주비 소계 500,000 원 100 %',
      '학습공간 지원비 소계 200,000 원 100 %',
      '합계 700,000 100 %',
    ].join(String.fromCharCode(10));
    const policy = parsePolicyText(ocr);
    expect(policy.plans).toEqual({
      housing: 50000,
      food: 200000,
      education: 0,
      transport: 250000,
      studyCafe: 0,
      cafe: 200000,
      readingRoom: 0,
    });
  });
});
