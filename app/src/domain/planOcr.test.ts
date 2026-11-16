import { describe, expect, it } from 'vitest';
import { plannedAmount, plannedItemName, readPlanTable } from './planOcr';
import { CLEAN_1440, GARBLED_720, NOISY_1080 } from './planOcr.fixture';

const LIMITS = { resident: 500_000, studySpace: 200_000 };
const PLAN = { housing: 0, food: 200_000, education: 150_000, transport: 150_000, studyCafe: 0, cafe: 200_000, readingRoom: 0 };

describe('readPlanTable', () => {
  it('reads only the 예상금액 column, not ratios, subtotals, the total or 최대 N만원 notes', () => {
    expect(readPlanTable(CLEAN_1440, LIMITS)).toEqual(PLAN);
  });

  it('drops a stray character OCR adds after an amount (150,0009, 200.000 g)', () => {
    expect(readPlanTable(NOISY_1080, LIMITS)).toEqual(PLAN);
  });

  it('names rows by the site row order when item names, the header and 소계 are misread', () => {
    // 미상규액, 청주소개, 스태디카페, 카, 서실; the empty items show no 직접입력 at all.
    expect(readPlanTable(GARBLED_720, LIMITS)).toEqual(PLAN);
  });

  it('leaves an unreadable item out instead of guessing it from the group limit', () => {
    const withoutEducation = NOISY_1080.filter((line) => line.text !== '150,0009');
    const plans = readPlanTable(withoutEducation, LIMITS);
    expect(plans?.education).toBeUndefined();
    expect(plans?.food).toBe(200_000);
  });

  it('returns null when there is no plan table', () => {
    expect(readPlanTable([{ text: '식비 200,000원', left: 0, top: 0, right: 100, bottom: 10 }])).toBeNull();
  });
});

describe('plan table cells', () => {
  it('accepts names that OCR misread by one letter, but not the 사용처 descriptions', () => {
    expect(plannedItemName('스테디카페')).toBe('studyCafe');
    // One letter from both 교통비 and 교육비: left to the row order instead of guessing.
    expect(plannedItemName('교풍비')).toBeUndefined();
    expect(plannedItemName('과통비')).toBe('transport');
    expect(plannedItemName('카페 이용')).toBeUndefined();
    expect(plannedItemName('식비')).toBe('food');
  });

  it('reads won amounts and refuses ratios and notes', () => {
    expect(plannedAmount('200,000')).toBe(200_000);
    expect(plannedAmount('200-000')).toBe(200_000);
    expect(plannedAmount('0원')).toBe(0);
    expect(plannedAmount('200000 관')).toBe(200_000);
    expect(plannedAmount('40 %')).toBeUndefined();
    expect(plannedAmount('100')).toBeUndefined();
    expect(plannedAmount('최대 50만원')).toBeUndefined();
  });
});
