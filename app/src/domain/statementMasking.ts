import type { StatementRow } from './statementRedaction';

export type StatementMaskBlock = {
  firstIndex: number;
  lastIndex: number;
  label: string;
};

/**
 * Consecutive hidden rows are rendered as one clean block. Keeping this
 * calculation separate from canvas rendering makes it safe to preserve a
 * visible row between two excluded groups.
 */
export function groupStatementMaskBlocks(rows: StatementRow[], hiddenReasons: ReadonlyMap<string, string>): StatementMaskBlock[] {
  const blocks: StatementMaskBlock[] = [];
  let firstIndex = -1;
  let labels: string[] = [];
  const flush = (lastIndex: number) => {
    if (firstIndex < 0) return;
    const unique = [...new Set(labels)];
    const label = unique.length === 1 ? unique[0] : `${unique.map((value) => value.replace(/ 내역 제외$/, '').replace(/ 내역$/, '').replace(/ 제외$/, '')).join(' · ')} 내역 제외`;
    blocks.push({ firstIndex, lastIndex, label });
    firstIndex = -1;
    labels = [];
  };
  rows.forEach((row, index) => {
    const reason = hiddenReasons.get(row.id);
    if (reason) {
      if (firstIndex < 0) firstIndex = index;
      labels.push(reason);
      return;
    }
    flush(index - 1);
  });
  flush(rows.length - 1);
  return blocks;
}
