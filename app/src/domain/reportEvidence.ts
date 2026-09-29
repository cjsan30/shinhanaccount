import type { StoredEvidence } from '../native/evidenceVault';
import type { StatementRow } from './statementRedaction';

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
  statementRows?: StatementRow[];
  excludedStatementRowIds?: string[];
  order: number;
};
