import type { StoredEvidence } from '../native/evidenceVault';

export type ReportEvidenceSection = 'statement' | 'transactionProof' | 'receipt';

export type ReportEvidenceRecord = {
  id: string;
  stored: StoredEvidence;
  section: ReportEvidenceSection;
  category?: string;
  linkedEntryId?: string;
  receiptDate?: string;
  receiptAmount?: number;
  receiptMerchant?: string;
  order: number;
};
