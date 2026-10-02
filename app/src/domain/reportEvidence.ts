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
  /** 영수증을 추가했을 때의 자동 읽기 결과. 실패·중복 여부를 사용자가 바로 확인할 수 있다. */
  receiptOcrStatus?: 'linked' | 'ambiguous' | 'needs-input' | 'failed';
  receiptOcrMessage?: string;
  statementRows?: StatementRow[];
  excludedStatementRowIds?: string[];
  /** 표를 읽지 못한 입출금 PDF는 원본 노출을 막기 위해 제출서류 생성에서 제외한다. */
  statementParseFailed?: boolean;
  /** 원본 은행 PDF를 제출서류에 다시 그릴 때만, 이번 화면에서 비밀번호가 필요하다. 비밀번호 자체는 저장하지 않는다. */
  statementSourceRequiresPassword?: boolean;
  order: number;
};
