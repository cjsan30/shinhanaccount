import { describe, expect, it } from 'vitest';
import { getReportReadiness } from './reportReadiness';

const stored = { id: 'file-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' };
const entry = (id: string, occurredAt: string, status: 'classified' | 'excluded' = 'classified') => ({ id, occurredAt, amount: 5000, merchant: id, cardLast4: '1234', status });

describe('report readiness', () => {
  it('requires one linked receipt for each classified policy-period payment', () => {
    const readiness = getReportReadiness(
      [entry('linked', '2026-09-20T12:00:00+09:00'), entry('missing', '2026-09-21T12:00:00+09:00')],
      [{ id: 'receipt-1', stored, section: 'receipt', linkedEntryId: 'linked', order: 0 }],
      '2026-09',
    );
    expect(readiness.linkedEntryIds).toEqual(new Set(['linked']));
    expect(readiness.missingReceipts.map((item) => item.id)).toEqual(['missing']);
  });

  it('does not accept stale, excluded, or out-of-period links as coverage', () => {
    const readiness = getReportReadiness(
      [entry('valid', '2026-09-20T12:00:00+09:00'), entry('excluded', '2026-09-21T12:00:00+09:00', 'excluded'), entry('old', '2026-08-20T12:00:00+09:00')],
      [
        { id: 'receipt-1', stored, section: 'receipt', linkedEntryId: 'excluded', order: 0 },
        { id: 'receipt-2', stored, section: 'receipt', linkedEntryId: 'old', order: 1 },
      ],
      '2026-09',
    );
    expect(readiness.linkedEntryIds.size).toBe(0);
    expect(readiness.missingReceipts.map((item) => item.id)).toEqual(['valid']);
  });
});
