import type { LedgerEntry } from '../domain/ledger';

/** onUndo is given only while the latest import can still be undone (it is kept in memory, decision 2026-11-18). */
export function ImportMergeSummary({ summary, entries, onUndo }: { summary: string; entries: LedgerEntry[]; onUndo?: () => void }) {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const remaining = entries.filter((entry) => entry.status === 'undecided'
    && entry.duplicateCandidateIds?.some((id) => id !== entry.id && entryIds.has(id))).length;
  if (!summary && !remaining) return null;
  return <div className="import-merge-summary" role="status">
    {summary && <p>가져오기 당시 집계: {summary}</p>}
    <p>현재 중복 확인 필요 {remaining}건</p>
    {onUndo && <><button className="sheet-action secondary-action import-undo" type="button" onClick={onUndo}>방금 가져온 내역 되돌리기</button><small className="import-undo__note">앱을 닫기 전까지만 되돌릴 수 있습니다.</small></>}
  </div>;
}
