import { describe, expect, it } from 'vitest';
import { addRecentReport, isRecentReport, removeRecentReport, type RecentReport } from './recentReports';

const report = (index: number): RecentReport => ({ uri: `content://media/${index}`, fileName: `report_${index}.pdf`, size: 1000 * index, savedAt: `2026-11-${String(index).padStart(2, '0')}T12:00:00+09:00` });

describe('recent reports', () => {
  it('keeps every saved report, newest first', () => {
    let list: RecentReport[] = [];
    for (let index = 1; index <= 12; index += 1) list = addRecentReport(list, report(index));
    expect(list).toHaveLength(12);
    expect(list[0].uri).toBe('content://media/12');
    expect(list.at(-1)?.uri).toBe('content://media/1');
  });

  it('does not list the same file twice', () => {
    const list = addRecentReport(addRecentReport([], report(1)), { ...report(1), size: 5 });
    expect(list).toEqual([{ ...report(1), size: 5 }]);
  });

  it('removes a report whose file is gone', () => {
    expect(removeRecentReport([report(1), report(2)], 'content://media/1')).toEqual([report(2)]);
  });

  it('accepts only well-formed stored rows', () => {
    expect(isRecentReport(report(1))).toBe(true);
    expect(isRecentReport({ uri: 'content://media/1', fileName: 'x.pdf', size: '1', savedAt: '2026-11-01' })).toBe(false);
    expect(isRecentReport(null)).toBe(false);
  });
});
