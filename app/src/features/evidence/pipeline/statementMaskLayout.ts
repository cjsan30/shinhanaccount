import { isInPeriodScope, type PeriodScope } from '../../../domain/periodSelectors';
import { groupStatementMaskBlocks } from '../../../domain/statementMasking';
import type { StatementRow } from '../../../domain/statementRedaction';
import type { StatementTableGeometry } from './statementTableGeometry';

export type MaskRect = { x: number; y: number; width: number; height: number };
export type LabeledMaskRect = MaskRect & { label: string };
export type CanvasSize = { width: number; height: number };
/** A text run from the PDF page, positioned in PDF points (origin at the bottom). */
export type PageTextItem = { str: string; x: number; y: number };

/** Statement rows carry a Korean local date and an optional time. */
export function statementRowOccurredAt(row: Pick<StatementRow, 'date' | 'time'>) {
  return `${row.date}T${row.time || '00:00:00'}+09:00`;
}

/**
 * Why each statement row is hidden in the submitted copy. Deposits are never
 * submitted, rows outside the policy period are not part of this report, and the
 * user can exclude unrelated withdrawals. The period reason wins over a deposit.
 */
export function statementHiddenReasons(rows: StatementRow[], excludedRowIds: string[], scope: PeriodScope) {
  const hiddenReasons = new Map<string, string>();
  rows.filter((row) => row.deposit > 0).forEach((row) => hiddenReasons.set(row.id, '입금 내역 제외'));
  rows.filter((row) => !isInPeriodScope({ occurredAt: statementRowOccurredAt(row) }, scope)).forEach((row) => hiddenReasons.set(row.id, '정책 기간 외 내역'));
  excludedRowIds.forEach((id) => { if (!hiddenReasons.has(id)) hiddenReasons.set(id, '사업 무관 제외'); });
  return hiddenReasons;
}

/** Rows located on one page, top of the page first. */
export function statementPageRows(rows: StatementRow[], pageIndex: number) {
  return rows.filter((row) => row.sourcePage === pageIndex && row.sourceY !== undefined).sort((left, right) => right.sourceY! - left.sourceY!);
}

/** Pages containing no visible transaction are omitted rather than submitted fully grey. */
export function isStatementPageFullyHidden(pageRows: StatementRow[], hiddenReasons: Map<string, string>) {
  return pageRows.length > 0 && pageRows.every((row) => hiddenReasons.has(row.id));
}

export function gridLineBefore(lines: number[], y: number) { return [...lines].reverse().find((line) => line < y - 1); }
export function gridLineAfter(lines: number[], y: number) { return lines.find((line) => line > y + 1); }

/**
 * One rectangle per run of consecutive hidden rows. With a detected grid the
 * rectangle runs from the grid line above the first row to the one below the
 * last row and spans the table's outer borders; otherwise it falls back to the
 * midpoints between neighbouring rows and Shinhan's fixed table columns.
 */
export function planStatementRowMasks(pageRows: StatementRow[], hiddenReasons: Map<string, string>, scale: number, canvas: CanvasSize, geometry?: StatementTableGeometry): LabeledMaskRect[] {
  return groupStatementMaskBlocks(pageRows, hiddenReasons).map((block) => {
    const first = pageRows[block.firstIndex]; const last = pageRows[block.lastIndex];
    const above = pageRows[block.firstIndex - 1]?.sourceY;
    const below = pageRows[block.lastIndex + 1]?.sourceY;
    const upper = above === undefined ? first.sourceY! + 8 : (above + first.sourceY!) / 2 - 1;
    const lower = below === undefined ? last.sourceY! - 8 : (last.sourceY! + below) / 2 + 1;
    const fallbackTop = canvas.height - upper * scale; const fallbackBottom = canvas.height - lower * scale;
    const firstCenter = canvas.height - first.sourceY! * scale; const lastCenter = canvas.height - last.sourceY! * scale;
    const top = geometry ? gridLineBefore(geometry.horizontalLines, firstCenter) ?? fallbackTop : fallbackTop;
    const bottom = geometry ? gridLineAfter(geometry.horizontalLines, lastCenter) ?? fallbackBottom : fallbackBottom;
    const left = geometry?.left ?? 28 * scale; const right = geometry?.right ?? Math.min(canvas.width, 545 * scale);
    return { x: left, y: top, width: right - left, height: Math.max(8 * scale, bottom - top), label: block.label };
  });
}

/** Any run of ten or more digits (account or card numbers) is covered on every page. */
export function planAccountNumberMasks(items: PageTextItem[], scale: number, canvasHeight: number): MaskRect[] {
  return items.filter((item) => /\d{10,}/.test(item.str)).map((item) => ({
    x: item.x * scale - 4,
    y: canvasHeight - item.y * scale - 18 * scale,
    width: Math.max(95 * scale, item.str.length * 10 * scale),
    height: 22 * scale,
  }));
}

/** Snaps a rectangle to whole pixels inside the canvas, never smaller than 1×1. */
export function clampMaskRect(rect: MaskRect, canvas: CanvasSize): MaskRect {
  const x = Math.max(0, Math.floor(rect.x)); const y = Math.max(0, Math.floor(rect.y));
  return { x, y, width: Math.max(1, Math.min(canvas.width - x, Math.ceil(rect.width))), height: Math.max(1, Math.min(canvas.height - y, Math.ceil(rect.height))) };
}
