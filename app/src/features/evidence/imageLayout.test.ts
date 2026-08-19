import { describe, expect, it } from 'vitest';
import { fitImageInsidePage } from './imageLayout';

describe('evidence image placement', () => {
  it('keeps a normal camera photo fully inside the page without cropping', () => {
    const placed = fitImageInsidePage(4032, 3024, 595.28, 841.89, 36);
    expect(placed.x).toBeGreaterThanOrEqual(36);
    expect(placed.y).toBeGreaterThanOrEqual(36);
    expect(placed.x + placed.width).toBeLessThanOrEqual(595.28 - 36 + 0.001);
    expect(placed.y + placed.height).toBeLessThanOrEqual(841.89 - 36 + 0.001);
    expect(placed.width / placed.height).toBeCloseTo(4032 / 3024);
  });

  it('keeps a long scanned receipt fully inside the page without changing its ratio', () => {
    const placed = fitImageInsidePage(1080, 6000, 595.28, 841.89, 36);
    expect(placed.height).toBeCloseTo(841.89 - 72);
    expect(placed.width / placed.height).toBeCloseTo(1080 / 6000);
  });
});
