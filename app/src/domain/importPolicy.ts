import type { PolicyPeriod } from './budget';
import { isInPeriodScope } from './periodSelectors';

export type ImportDatedRecord = { occurredAt: string };

export function filterImportToPolicyPeriod<T extends ImportDatedRecord>(records: T[], periodKey: string, period?: PolicyPeriod) {
  const included = records.filter((record) => isInPeriodScope(record, { periodKey, period }));
  return { included, excludedOutsidePeriod: records.length - included.length };
}
