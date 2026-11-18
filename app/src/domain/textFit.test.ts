import { describe, expect, it } from 'vitest';
import { budgetHeadingFits, fitScale } from './textFit';

describe('dashboard text fitting', () => {
  it('keeps the budget name and amount on one row only when the arrow still fits', () => {
    expect(budgetHeadingFits(300, 100, 150, 24, 8)).toBe(true);
    expect(budgetHeadingFits(300, 120, 150, 24, 8)).toBe(false);
  });

  it('scales the total down only as far as needed to stay on one line', () => {
    expect(fitScale(280, 250)).toBe(1);
    expect(fitScale(280, 400)).toBe(0.7);
    expect(fitScale(280, 420)).toBe(0.666);
    expect(fitScale(0, 400)).toBe(1);
  });
});
