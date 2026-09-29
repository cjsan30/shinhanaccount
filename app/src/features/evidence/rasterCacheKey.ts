import type { ReportEvidenceRecord } from '../../domain/reportEvidence';

export type EvidenceRasterDescriptor = Pick<ReportEvidenceRecord, 'id' | 'section' | 'statementRows' | 'excludedStatementRowIds'>;

// Statement pages are rendered after redaction. The rendered cache must change
// when a user excludes a row or successfully re-reads a password-protected PDF.
export function evidenceRasterCacheKey(item: EvidenceRasterDescriptor, profileId: string) {
  if (item.section !== 'statement') return `${item.id}:${profileId}`;
  const rows = (item.statementRows ?? []).map((row) => [row.id, row.date, row.time, row.summary, row.withdrawal, row.deposit, row.merchant, row.balance ?? '', row.branch ?? ''].join('~')).join('|');
  const excluded = [...(item.excludedStatementRowIds ?? [])].sort().join('|');
  return `${item.id}:${profileId}:${rows}:${excluded}`;
}
