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
  /** OCR의 날짜·금액이 하나의 결제와만 일치해 자동 연결된 경우다. */
  receiptAutoLinked?: boolean;
  statementRows?: StatementRow[];
  excludedStatementRowIds?: string[];
  /** 표를 읽지 못한 입출금 PDF는 원본 노출을 막기 위해 제출서류 생성에서 제외한다. */
  statementParseFailed?: boolean;
  order: number;
};
