import type { StoredEvidence } from '../native/evidenceVault';

export type ReportEvidenceSection = 'statement' | 'transactionProof' | 'receipt';

/**
 * A report attachment deliberately has no ledger-entry foreign key. A receipt
 * can support more than one payment, and a statement can cover an entire
 * period, so forcing a one-to-one relationship creates misleading output.
 */
export type ReportEvidenceRecord = {
  id: string;
  stored: StoredEvidence;
  section: ReportEvidenceSection;
  category?: string;
  order: number;
};
