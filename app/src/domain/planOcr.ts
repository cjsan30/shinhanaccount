import type { BudgetKey } from './budget';
import { POLICY_ITEM_ALIASES, POLICY_ITEMS, type PolicyItem } from './policy';

/** One OCR line and where it sits on the image, in image pixels. */
export type OcrLineBox = { text: string; left: number; top: number; right: number; bottom: number };

/** Row order of the 지원금 사용 계획서 table on the program site. */
export const PLAN_TABLE_ROWS: readonly PolicyItem[] = ['housing', 'food', 'education', 'transport', 'studyCafe', 'cafe', 'readingRoom'];

const compact = (text: string) => text.replace(/\s/g, '');
const centerX = (line: OcrLineBox) => (line.left + line.right) / 2;
const centerY = (line: OcrLineBox) => (line.top + line.bottom) / 2;
const height = (line: OcrLineBox) => Math.max(1, line.bottom - line.top);

const aliases = Object.entries(POLICY_ITEM_ALIASES).flatMap(([item, names]) => names.map((name) => ({ name, item: item as PolicyItem })));

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * The item a table cell names. The whole cell must be the name; OCR often swaps one
 * letter (스테디카페, 교풍비), so names of three letters or more may differ by one.
 * 카페 이용 or 대중교통료 in the 사용처 column are not names.
 */
export function plannedItemName(text: string): PolicyItem | undefined {
  const value = compact(text);
  const exact = aliases.find((alias) => alias.name === value);
  if (exact) return exact.item;
  const close = new Set(aliases.filter((alias) => alias.name.length >= 3 && value.length === alias.name.length && editDistance(value, alias.name) === 1).map((alias) => alias.item));
  return close.size === 1 ? [...close][0] : undefined;
}

/**
 * A won amount cell: 200,000 / 200.000 / 0원. OCR often reads the trailing 원 as one other
 * letter (200000 관, 150,000 g) or a digit after a complete thousands group (150,0009); that
 * stray character is dropped. Ratios (with %, or 1–999 without 원) and "최대 N만원" notes are
 * not amounts.
 */
export function plannedAmount(text: string): number | undefined {
  if (/%|만\s*원/.test(text)) return undefined;
  const cell = compact(text);
  const match = cell.match(/^(\d{1,3}(?:[,.-]\d{3})+)\d?(원)?[가-힣a-zA-Z]?$/) ?? cell.match(/^(\d+)(원)?[가-힣a-zA-Z]?$/);
  if (!match) return undefined;
  const value = Number(match[1].replace(/[,.-]/g, ''));
  if (!Number.isSafeInteger(value)) return undefined;
  if (value > 0 && value < 1000 && !match[2]) return undefined;
  return value;
}

/** Header cells, also as OCR misreads them (매상금액, 사용회, 구주). Compared without spaces. */
const isHeader = (text: string) => /상금[액엑]|^[예매미]상금|^비[율을]$|^사용[처체치회]?$|^구[분주]?$/.test(compact(text));
const SUBTOTAL = /소\s*[계게]|합\s*[계게]/;
const GROUP_LABEL = /정\s*주\s*비|학\s*습|공\s*간|지\s*원\s*비|\(\s*\d+\s*만\s*원\s*\)|만원\)/;
const DIRECT_INPUT = /직\s*[접잡]\s*[입일의]\s*[력럭]/;

/**
 * Reads the 예상금액 column of the plan table from line positions.
 * Rows are the lines between the header row and the 소계 row, grouped by height. With exactly
 * seven rows the site's row order names them; a readable item name always wins. Ratios,
 * subtotals, the total and "최대 N만원" notes are never read as amounts. A row without a
 * number is 0 when it shows 직접입력, as the site does for empty items, or when the other
 * items of its group already add up to the group limit (amounts are never negative).
 * Returns null when no table is found, so the caller can fall back to text parsing.
 */
export function readPlanTable(lines: OcrLineBox[], bucketLimits?: Record<BudgetKey, number>): Partial<Record<PolicyItem, number>> | null {
  const headerLines = lines.filter((line) => isHeader(line.text) && !SUBTOTAL.test(line.text));
  if (!headerLines.length) return null;
  const firstHeader = headerLines.reduce((top, line) => line.top < top.top ? line : top);
  const headerRow = headerLines.filter((line) => Math.abs(centerY(line) - centerY(firstHeader)) <= height(firstHeader) * 1.5);
  const tableTop = Math.max(...headerRow.map((line) => line.bottom));
  const subtotal = lines.filter((line) => line.top > tableTop && SUBTOTAL.test(line.text)).sort((a, b) => a.top - b.top)[0];
  if (!subtotal) return null;
  // The 소계 row starts in the far-left 구분 column, left of every item name. When OCR garbles
  // the word 소계 (청주소개), a far-left cell with 소·합·계 still ends the item rows.
  const named = lines.filter((line) => line.top > tableTop && line.bottom < subtotal.bottom && plannedItemName(line.text));
  const nameColumnLeft = named.length ? Math.min(...named.map((line) => line.left)) : undefined;
  const leftStart = nameColumnLeft === undefined ? undefined : lines
    .filter((line) => line.top > tableTop && line.top < subtotal.top && centerX(line) < nameColumnLeft && /소|합|[계게개]$/.test(compact(line.text)))
    .sort((a, b) => a.top - b.top)[0];
  const tableBottom = Math.min(subtotal.top, leftStart?.top ?? Number.POSITIVE_INFINITY);
  const ratioHeader = headerRow.find((line) => /비\s*[율을]/.test(line.text));
  const percentCells = lines.filter((line) => line.top > tableTop && line.bottom <= subtotal.bottom && /%/.test(line.text));
  const ratioLeft = ratioHeader ? ratioHeader.left - height(ratioHeader) : percentCells.length ? Math.min(...percentCells.map((line) => line.left)) - 1 : Number.POSITIVE_INFINITY;

  const cells = lines
    .filter((line) => centerY(line) > tableTop && centerY(line) < tableBottom && !GROUP_LABEL.test(line.text))
    .sort((a, b) => centerY(a) - centerY(b));
  const rows: OcrLineBox[][] = [];
  for (const cell of cells) {
    const row = rows.at(-1);
    const rowCenter = row ? row.reduce((sum, line) => sum + centerY(line), 0) / row.length : 0;
    const rowHeight = row ? Math.max(...row.map(height)) : 0;
    if (row && Math.abs(centerY(cell) - rowCenter) <= Math.max(rowHeight, height(cell)) * 0.6) row.push(cell);
    else rows.push([cell]);
  }

  const plans: Partial<Record<PolicyItem, number>> = {};
  rows.forEach((row, index) => {
    const named = row.map((line) => plannedItemName(line.text)).find((item) => item !== undefined);
    const item = named ?? (rows.length === PLAN_TABLE_ROWS.length ? PLAN_TABLE_ROWS[index] : undefined);
    if (!item || plans[item] !== undefined) return;
    const amounts = row
      .filter((line) => centerX(line) < ratioLeft)
      .map((line) => ({ line, amount: plannedAmount(line.text) }))
      .filter((cell): cell is { line: OcrLineBox; amount: number } => cell.amount !== undefined)
      .sort((a, b) => a.line.left - b.line.left);
    if (amounts.length) plans[item] = amounts[0].amount;
    else if (row.some((line) => DIRECT_INPUT.test(compact(line.text)))) plans[item] = 0;
  });
  if (bucketLimits) {
    for (const bucket of Object.keys(bucketLimits) as BudgetKey[]) {
      const items = POLICY_ITEMS.filter((item) => item.bucket === bucket).map((item) => item.key);
      const read = items.reduce((sum, item) => sum + (plans[item] ?? 0), 0);
      if (read === bucketLimits[bucket]) items.forEach((item) => { plans[item] ??= 0; });
    }
  }
  return plans;
}
