import { describe, expect, it } from 'vitest';
import { splitEvidenceByPolicyPeriod, type ReportEvidenceRecord } from './reportEvidence';

const record = (id: string, attachedAt: string): ReportEvidenceRecord => ({
  id, section: 'receipt', order: 0, stored: { id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', size: 1, attachedAt },
});

describe('previous policy period evidence', () => {
  it('treats files attached before the current period start in Korea as the previous report', () => {
    const records = [
      record('gap', '2026-10-14T23:59:59+09:00'),
      record('utc-before', '2026-10-14T14:59:59Z'),
      record('start', '2026-10-15T00:00:00+09:00'),
      record('utc-start', '2026-10-14T15:00:00Z'),
    ];
    const { current, previous } = splitEvidenceByPolicyPeriod(records, '2026-10');
    expect(previous.map((item) => item.id)).toEqual(['gap', 'utc-before']);
    expect(current.map((item) => item.id)).toEqual(['start', 'utc-start']);
  });

  it('keeps files attached during the gap while the previous period is still the active one', () => {
    const { previous } = splitEvidenceByPolicyPeriod([record('gap', '2026-10-12T10:00:00+09:00')], '2026-09');
    expect(previous).toEqual([]);
  });

  it('follows a custom period start and keeps records with an unreadable date', () => {
    const records = [record('before', '2026-10-31T12:00:00+09:00'), record('after', '2026-11-01T00:00:00+09:00'), record('broken', 'not a date')];
    const { current, previous } = splitEvidenceByPolicyPeriod(records, '2026-11', { startDay: 1, endDay: 30 });
    expect(previous.map((item) => item.id)).toEqual(['before']);
    expect(current.map((item) => item.id)).toEqual(['after', 'broken']);
  });
});
