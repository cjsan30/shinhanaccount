export type StatementRow = {
  id: string;
  date: string;
  time: string;
  summary: string;
  withdrawal: number;
  deposit: number;
  merchant: string;
  balance?: number;
  branch?: string;
  sourcePage?: number;
  sourceY?: number;
};

export type RedactedStatementRow = StatementRow & {
  redacted: boolean;
  reason?: string;
  displayMerchant: string;
  displaySummary: string;
};

/**
 * Keep every statement row and its monetary columns in the submitted table.
 * Only the descriptive fields are masked, so reviewers can still reconcile
 * the original order and balances without seeing unrelated counterparties.
 */
export function redactStatementRows(rows: StatementRow[], excludedRowIds: Iterable<string>, reason = '사업 무관 내역'): RedactedStatementRow[] {
  const excluded = new Set(excludedRowIds);
  return rows.map((row) => {
    const redacted = excluded.has(row.id);
    return {
      ...row,
      redacted,
      ...(redacted ? { reason, displayMerchant: '████████', displaySummary: '████████' } : { displayMerchant: row.merchant, displaySummary: row.summary }),
    };
  });
}

export function formatStatementAmount(value: number) {
  return value > 0 ? value.toLocaleString('ko-KR') : '';
}
