import { describe, expect, it } from 'vitest';
import { detectStatementTableGeometry, type PixelImage } from './statementTableGeometry';

/** A white canvas on which dark table rules can be drawn, like a rendered Shinhan PDF page. */
function canvas(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const dark = (x: number, y: number) => { const offset = (y * width + x) * 4; data[offset] = 20; data[offset + 1] = 20; data[offset + 2] = 20; };
  return {
    image: { width, height, data } as PixelImage,
    hline: (y: number, from: number, to: number) => { for (let x = from; x <= to; x += 1) dark(x, y); },
    vline: (x: number, from: number, to: number) => { for (let y = from; y <= to; y += 1) dark(x, y); },
  };
}

/** Rows at PDF y 180 and 140 on a 300px page at scale 1 sit at canvas y 120 and 160. */
function table() {
  const page = canvas(620, 300);
  for (const y of [100, 140, 180]) page.hline(y, 30, 540);
  page.vline(30, 100, 180);
  page.vline(540, 100, 180);
  return page;
}

describe('statement table geometry', () => {
  it('finds the outer borders and every horizontal rule around the rows', () => {
    expect(detectStatementTableGeometry(table().image, 1, [180, 140])).toEqual({ left: 30, right: 540, horizontalLines: [100, 140, 180] });
  });

  it('treats an anti-aliased two-pixel rule as one line', () => {
    const page = table();
    page.hline(141, 30, 540);
    expect(detectStatementTableGeometry(page.image, 1, [180, 140])?.horizontalLines).toEqual([100, 140, 180]);
  });

  it('ignores short rules that do not span the table', () => {
    const page = table();
    page.hline(120, 30, 200);
    expect(detectStatementTableGeometry(page.image, 1, [180, 140])?.horizontalLines).toEqual([100, 140, 180]);
  });

  it('only looks near the rows on the page', () => {
    const page = table();
    page.hline(280, 30, 540);
    expect(detectStatementTableGeometry(page.image, 1, [180, 140])?.horizontalLines).toEqual([100, 140, 180]);
  });

  it('gives up without rows or without at least two rules', () => {
    expect(detectStatementTableGeometry(table().image, 1, [])).toBeUndefined();
    const page = canvas(620, 300);
    page.hline(140, 30, 540);
    expect(detectStatementTableGeometry(page.image, 1, [180, 140])).toBeUndefined();
  });

  it('scales the search window with the render scale', () => {
    const page = canvas(1240, 600);
    for (const y of [200, 280, 360]) page.hline(y, 60, 1080);
    page.vline(60, 200, 360);
    page.vline(1080, 200, 360);
    expect(detectStatementTableGeometry(page.image, 2, [180, 140])).toEqual({ left: 60, right: 1080, horizontalLines: [200, 280, 360] });
  });
});
