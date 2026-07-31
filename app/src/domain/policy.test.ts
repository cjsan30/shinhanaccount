import { describe, expect, it } from 'vitest';
import { getPolicyLimit, parsePolicyText } from './policy';

describe('policy text import', () => {
  it('maps OCR table values by expected-amount row order', () => {
    const ocr = `구분 정주비 (50만원) 학습공간 지원비 합계 (20만원) 정주비 소계 학습공간 지원비 소계 주거비 식비 교육비 교통비 스터디카페 카페 독서실 사용처 숙박비 식비 직접입력 고속열차 및 유류비 직접입력 학습공간 직접입력 예상금액 50,000 200,000 원원 250,000 원 원 0 원 0 200,000 원 700,000 원 500,000 원 200,000 원 비율 10 40 50 %`;
    const policy = parsePolicyText(ocr);
    expect(policy.plans).toMatchObject({ housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 });
    expect(getPolicyLimit(policy, 'resident')).toBe(500000);
    expect(getPolicyLimit(policy, 'studySpace')).toBe(200000);
  });

  it('maps pasted rows by support item and ignores the user-defined usage name', () => {
    const copied = `구분\t사용처\t예상금액\t비율\n정주비\n(50만원)\t주거비\t\n숙박비\n50,000\n 원\t\n10\n %\n식비\t\n식비\n200,000\n 원\t\n40\n %\n교육비\t\n직접입력\n0\n 원\t\n0\n %\n교통비\t\n고속열차 및 유류비\n250,000\n 원\t\n50\n %\n학습공간 지원비\n(20만원)\t스터디카페\t\n직접입력\n0\n 원\t\n0\n %\n카페\t\n학습공간\n200,000\n 원\t\n100\n %\n독서실\t\n직접입력\n0\n 원\t\n0\n %`;
    expect(parsePolicyText(copied).plans).toMatchObject({ housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 });
  });
});