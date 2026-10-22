import { getPolicyPeriodRange, type PolicyPeriod } from './budget';
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
  /** 이전 버전의 자동 연결 표식. 새 연결은 반드시 사용자가 결제를 선택한다. */
  receiptAutoLinked?: boolean;
  /** 영수증에서 결제 날짜를 읽은 결과. 결제 연결은 항상 사용자가 확정한다. */
  receiptOcrStatus?: 'linked' | 'ambiguous' | 'needs-input' | 'failed' | 'reading';
  receiptOcrMessage?: string;
  statementRows?: StatementRow[];
  excludedStatementRowIds?: string[];
  /** 표를 읽지 못한 입출금 PDF는 원본 노출을 막기 위해 제출서류 생성에서 제외한다. */
  statementParseFailed?: boolean;
  /** 원본 은행 PDF를 제출서류에 다시 그릴 때만, 이번 화면에서 비밀번호가 필요하다. 비밀번호 자체는 저장하지 않는다. */
  statementSourceRequiresPassword?: boolean;
  order: number;
};

/**
 * Files attached before the current policy period began were gathered for an earlier report.
 * Records whose attachment time cannot be read are kept, so nothing is removed by mistake.
 */
export function splitEvidenceByPolicyPeriod(records: ReportEvidenceRecord[], periodKey: string, period?: PolicyPeriod) {
  const { start } = getPolicyPeriodRange(periodKey, period);
  const startsAt = start ? new Date(`${start}T00:00:00+09:00`).getTime() : Number.NaN;
  const isPrevious = (record: ReportEvidenceRecord) => {
    const attachedAt = new Date(record.stored.attachedAt).getTime();
    return Number.isFinite(startsAt) && Number.isFinite(attachedAt) && attachedAt < startsAt;
  };
  return { current: records.filter((record) => !isPrevious(record)), previous: records.filter(isPrevious) };
}
