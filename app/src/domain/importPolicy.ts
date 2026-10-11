import { isDateInPolicyPeriod, type PolicyPeriod } from './budget';

export type ImportDatedRecord = { occurredAt: string };

export function filterImportToPolicyPeriod<T extends ImportDatedRecord>(records: T[], periodKey: string, period?: PolicyPeriod) {
  const included = records.filter((record) => isDateInPolicyPeriod(new Date(record.occurredAt), periodKey, period));
  return { included, excludedOutsidePeriod: records.length - included.length };
}
