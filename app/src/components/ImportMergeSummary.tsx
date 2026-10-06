import type { LedgerEntry } from '../domain/ledger';

export function ImportMergeSummary({ summary, entries }: { summary: string; entries: LedgerEntry[] }) {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const remaining = entries.filter((entry) => entry.status === 'undecided'
    && entry.duplicateCandidateIds?.some((id) => id !== entry.id && entryIds.has(id))).length;
  if (!summary && !remaining) return null;
  return <div className="import-merge-summary" role="status">
    {summary && <p>가져오기 당시 집계: {summary}</p>}
    <p>현재 중복 확인 필요 {remaining}건</p>
  </div>;
}
