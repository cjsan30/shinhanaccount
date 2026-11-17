import type { LedgerEntry } from '../domain/ledger';
import type { ImportSummary } from '../domain/importSummary';

/**
 * Import result on the 분류 필요 screen (decision 2026-11-18, 시안 C 1안): at most three lines, only those
 * that apply. onUndo is given only while the latest import can still be undone (it is kept in memory).
 */
export function ImportMergeSummary({ summary, entries, onUndo }: { summary: ImportSummary | null; entries: LedgerEntry[]; onUndo?: () => void }) {
  const entryIds = new Set(entries.map((entry) => entry.id));
  const remaining = entries.filter((entry) => entry.status === 'undecided'
    && entry.duplicateCandidateIds?.some((id) => id !== entry.id && entryIds.has(id))).length;
  if (!summary && !remaining) return null;
  const showAdded = summary && (summary.added > 0 || !summary.alreadyInApp);
  return <div className="import-merge-summary" role="status">
    {summary && <p className="import-merge-summary__title">가져오기 결과</p>}
    <ul className="import-merge-summary__list">
      {showAdded && <li><span>새로 추가</span><b>{summary.added}건</b></li>}
      {summary && summary.alreadyInApp > 0 && <li><span>이미 앱에 있던 결제</span><b>{summary.alreadyInApp}건</b></li>}
      {remaining > 0 && <li className="is-alert"><span>중복 확인 필요</span><b>{remaining}건</b></li>}
    </ul>
    {onUndo && <><button className="sheet-action secondary-action import-undo" type="button" onClick={onUndo}>방금 가져온 내역 되돌리기</button><small className="import-undo__note">앱을 닫기 전까지만 되돌릴 수 있습니다.</small></>}
  </div>;
}
