import { describe, expect, it } from 'vitest';
import type { StatementRow } from '../../../domain/statementRedaction';
import {
  clampMaskRect,
  gridLineAfter,
  gridLineBefore,
  isStatementPageFullyHidden,
  planAccountNumberMasks,
  planStatementRowMasks,
  statementHiddenReasons,
  statementPageRows,
} from './statementMaskLayout';

const row = (id: string, patch: Partial<StatementRow> = {}): StatementRow => ({ id, date: '2026-09-20', time: '12:00:00', summary: '체크카드', withdrawal: 5000, deposit: 0, merchant: id, sourcePage: 0, ...patch });
const scope = { periodKey: '2026-09' };
const page = { width: 620, height: 300 };
const geometry = { left: 30, right: 540, horizontalLines: [100, 140, 180, 220] };
// Canvas y = 300 - sourceY at scale 1, so these rows sit at 120, 160 and 200.
const rows = [row('top', { sourceY: 180 }), row('middle', { sourceY: 140 }), row('bottom', { sourceY: 100 })];

describe('statement hidden reasons', () => {
  it('hides deposits, out-of-period rows and user exclusions with the right label', () => {
    const reasons = statementHiddenReasons([
      row('withdrawal'),
      row('deposit', { withdrawal: 0, deposit: 9000 }),
      row('gap', { date: '2026-10-12' }),
      row('old-deposit', { date: '2026-08-20', deposit: 9000 }),
      row('excluded'),
    ], ['excluded', 'gap'], scope);
    expect(Object.fromEntries(reasons)).toEqual({ deposit: '입금 내역 제외', gap: '정책 기간 외 내역', 'old-deposit': '정책 기간 외 내역', excluded: '사업 무관 제외' });
  });

  it('treats a row without a time as midnight on its date', () => {
    expect(statementHiddenReasons([row('start', { date: '2026-09-15', time: '' })], [], scope).size).toBe(0);
    expect(statementHiddenReasons([row('before', { date: '2026-09-14', time: '' })], [], scope).get('before')).toBe('정책 기간 외 내역');
  });
});

describe('statement page rows', () => {
  it('keeps the page rows with coordinates, top first', () => {
    const mixed = [row('low', { sourceY: 100 }), row('other-page', { sourcePage: 1, sourceY: 300 }), row('no-y'), row('high', { sourceY: 400 })];
    expect(statementPageRows(mixed, 0).map((item) => item.id)).toEqual(['high', 'low']);
  });

  it('omits a page only when it has rows and all of them are hidden', () => {
    expect(isStatementPageFullyHidden([], new Map())).toBe(false);
    expect(isStatementPageFullyHidden(rows, new Map(rows.map((item) => [item.id, 'x'])))).toBe(true);
    expect(isStatementPageFullyHidden(rows, new Map([['top', 'x']]))).toBe(false);
  });
});

describe('grid lines', () => {
  it('finds the nearest rule strictly above and below a row centre', () => {
    expect(gridLineBefore([100, 140, 180], 160)).toBe(140);
    expect(gridLineAfter([100, 140, 180], 160)).toBe(180);
    expect(gridLineBefore([100, 140, 180], 141)).toBe(100);
    expect(gridLineAfter([100, 140, 180], 179)).toBe(undefined);
    expect(gridLineBefore([100], 90)).toBeUndefined();
  });
});

describe('row masks', () => {
  it('snaps a hidden row to the grid lines and the outer borders', () => {
    const masks = planStatementRowMasks(rows, new Map([['middle', '사업 무관 제외']]), 1, page, geometry);
    expect(masks).toEqual([{ x: 30, y: 140, width: 510, height: 40, label: '사업 무관 제외' }]);
  });

  it('covers consecutive hidden rows with one block and keeps a visible row between blocks', () => {
    const masks = planStatementRowMasks(rows, new Map([['top', '입금 내역 제외'], ['bottom', '사업 무관 제외']]), 1, page, geometry);
    expect(masks.map(({ y, height, label }) => ({ y, height, label }))).toEqual([{ y: 100, height: 40, label: '입금 내역 제외' }, { y: 180, height: 40, label: '사업 무관 제외' }]);
    const merged = planStatementRowMasks(rows, new Map([['top', '입금 내역 제외'], ['middle', '사업 무관 제외']]), 1, page, geometry);
    expect(merged).toEqual([{ x: 30, y: 100, width: 510, height: 80, label: '입금 · 사업 무관 내역 제외' }]);
  });

  it('falls back to row midpoints and the fixed table columns without a grid', () => {
    // top row: upper edge 8pt above it, lower edge 1pt below the midpoint with the next row.
    const masks = planStatementRowMasks(rows, new Map([['top', '사업 무관 제외']]), 1, page);
    expect(masks).toEqual([{ x: 28, y: 300 - 188, width: 545 - 28, height: (300 - 161) - (300 - 188), label: '사업 무관 제외' }]);
    const last = planStatementRowMasks(rows, new Map([['bottom', '사업 무관 제외']]), 1, page)[0];
    expect({ y: last.y, height: last.height }).toEqual({ y: 300 - 119, height: (300 - 92) - (300 - 119) });
  });

  it('uses the grid line when only one side is found and keeps a minimum height', () => {
    const partial = { left: 30, right: 540, horizontalLines: [100, 140] };
    const [mask] = planStatementRowMasks(rows, new Map([['middle', 'x']]), 1, page, partial);
    // Top snaps to the rule at 140; no rule below, so the bottom falls back to
    // 1pt below the midpoint with the next row: (140 + 100) / 2 + 1 = 121 → y 179.
    expect(mask.y).toBe(140);
    expect(mask.height).toBe((300 - 121) - 140);
    const [thin] = planStatementRowMasks([row('a', { sourceY: 100 }), row('b', { sourceY: 99 })], new Map([['a', 'x']]), 2, { width: 1240, height: 600 });
    expect(thin.height).toBe(16);
  });

  it('scales coordinates and limits the fallback width to the canvas', () => {
    const [mask] = planStatementRowMasks(rows, new Map([['middle', 'x']]), 2, { width: 1000, height: 600 });
    expect({ x: mask.x, width: mask.width }).toEqual({ x: 56, width: 1000 - 56 });
  });
});

describe('account number masks', () => {
  it('covers digit runs of ten or more at the text position', () => {
    const masks = planAccountNumberMasks([{ str: '110123456789', x: 50, y: 200 }, { str: '2026-09-20', x: 10, y: 10 }, { str: '123456789', x: 10, y: 10 }], 2, 1000);
    expect(masks).toEqual([{ x: 96, y: 1000 - 400 - 36, width: 240, height: 44 }]);
  });

  it('keeps a minimum width for short numbers', () => {
    expect(planAccountNumberMasks([{ str: '1234567890', x: 0, y: 0 }], 1, 100)[0].width).toBe(100);
    expect(planAccountNumberMasks([{ str: '1234567890', x: 0, y: 0 }], 2, 100)[0].width).toBe(200);
  });
});

describe('mask clamping', () => {
  it('snaps to whole pixels inside the canvas', () => {
    expect(clampMaskRect({ x: 10.6, y: 20.2, width: 30.1, height: 5.5 }, page)).toEqual({ x: 10, y: 20, width: 31, height: 6 });
    expect(clampMaskRect({ x: -5, y: -3, width: 20, height: 10 }, page)).toEqual({ x: 0, y: 0, width: 20, height: 10 });
    expect(clampMaskRect({ x: 600, y: 290, width: 100, height: 100 }, page)).toEqual({ x: 600, y: 290, width: 20, height: 10 });
    expect(clampMaskRect({ x: 700, y: 400, width: 0, height: 0 }, page)).toEqual({ x: 700, y: 400, width: 1, height: 1 });
  });
});
