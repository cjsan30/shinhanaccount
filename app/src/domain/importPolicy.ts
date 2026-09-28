import { isDateInPolicyPeriod } from './budget';

export type ImportDatedRecord = { occurredAt: string };

export function filterImportToPolicyPeriod<T extends ImportDatedRecord>(records: T[], periodKey: string) {
  const included = records.filter((record) => isDateInPolicyPeriod(new Date(record.occurredAt), periodKey));
  return { included, excludedOutsidePeriod: records.length - included.length };
}
