import { describe, expect, it } from 'vitest';
import { filterImportToPolicyPeriod } from './importPolicy';

describe('import period filtering', () => {
  it('does not retain entries outside the active 14th-to-10th policy period', () => {
    const result = filterImportToPolicyPeriod([
      { occurredAt: '2026-09-14T12:00:00+09:00' },
      { occurredAt: '2026-10-10T23:59:00+09:00' },
      { occurredAt: '2026-09-13T12:00:00+09:00' },
      { occurredAt: '2026-10-11T00:00:00+09:00' },
    ], '2026-09');
    expect(result.included).toHaveLength(2);
    expect(result.excludedOutsidePeriod).toBe(2);
  });
});
