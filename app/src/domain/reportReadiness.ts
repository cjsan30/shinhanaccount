import type { PolicyPeriod } from './budget';
import type { LedgerEntry } from './ledger';
import { isEntryInPolicyPeriod } from './ledger';
import type { ReportEvidenceRecord } from './reportEvidence';

export type ReportReadiness = {
  payments: LedgerEntry[];
  linkedEntryIds: Set<string>;
  missingReceipts: LedgerEntry[];
};

/**
 * A submission report must make it obvious which policy-period payments still
 * need a receipt. Links to stale, excluded, or out-of-period entries never
 * count as evidence coverage.
 */
export function getReportReadiness(entries: LedgerEntry[], evidence: ReportEvidenceRecord[], periodKey: string, period?: PolicyPeriod): ReportReadiness {
  const payments = entries.filter((entry) => entry.status === 'classified' && isEntryInPolicyPeriod(entry, periodKey, period));
  const paymentIds = new Set(payments.map((entry) => entry.id));
  const linkedEntryIds = new Set(evidence
    .filter((item) => item.section === 'receipt' && item.linkedEntryId && paymentIds.has(item.linkedEntryId))
    .map((item) => item.linkedEntryId as string));
  return { payments, linkedEntryIds, missingReceipts: payments.filter((entry) => !linkedEntryIds.has(entry.id)) };
}
