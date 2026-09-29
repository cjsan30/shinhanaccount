import type { Ledger } from './ledger';
import type { PolicyBook } from './policy';
import type { ReportEvidenceRecord } from './reportEvidence';

export type VerificationDecisionStatus = 'passed' | 'failed';
export type VerificationDecision = { status: VerificationDecisionStatus; decidedAt: string; note?: string };
export type VerificationAutoEvidence = { passed: boolean; observedAt: string; summary: string };
export type VerificationState = {
  decisions: Record<string, VerificationDecision>;
  automatic: Record<string, VerificationAutoEvidence>;
};

export const createVerificationState = (): VerificationState => ({ decisions: {}, automatic: {} });

/** Keeps optional diagnostic notes useful without exporting likely financial identifiers. */
export function sanitizeVerificationNote(value: string) {
  return value
    .replace(/\b(?:\d[\d,\- ]{3,}\d|\d{4,})\b/g, '[가림]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export type AutomaticCheckInput = {
  storageReady: boolean;
  storageError: boolean;
  policyBook: PolicyBook;
  ledger: Ledger;
  evidence: ReportEvidenceRecord[];
  now?: Date;
};

export type AutomaticCheck = { id: string; title: string; description: string; evidence: VerificationAutoEvidence };

export function buildAutomaticChecks(input: AutomaticCheckInput): AutomaticCheck[] {
  const observedAt = (input.now ?? new Date()).toISOString();
  const imported = input.ledger.entries.filter((entry) => entry.source === 'excel' || entry.source === 'bankCsv').length;
  const classified = input.ledger.entries.filter((entry) => entry.status === 'classified').length;
  const invalidEntry = input.ledger.entries.some((entry) => !Number.isFinite(entry.amount) || entry.amount < 0 || !entry.occurredAt || !entry.merchant.trim());
  const receiptCount = input.evidence.filter((item) => item.section === 'receipt').length;
  const linkedReceiptCount = input.evidence.filter((item) => item.section === 'receipt' && item.linkedEntryId).length;
  return [
    {
      id: 'encrypted-storage', title: '암호화 저장소', description: '저장소가 오류 없이 열리고 현재 상태를 읽었습니다.',
      evidence: { passed: input.storageReady && !input.storageError, observedAt, summary: input.storageError ? '저장소 오류가 감지되었습니다.' : input.storageReady ? '암호화 저장소 열기 성공' : '저장소 준비 중' },
    },
    {
      id: 'policy-state', title: '정책 상태', description: '지원자 정책 또는 비지원자 모드의 상태를 확인했습니다.',
      evidence: { passed: input.policyBook.mode === 'not-applicant' || input.policyBook.versions.length > 0, observedAt, summary: input.policyBook.mode === 'not-applicant' ? '비지원자 모드 저장됨' : input.policyBook.versions.length ? `정책 ${input.policyBook.versions.length}개 저장됨` : '확정된 정책이 없습니다.' },
    },
    {
      id: 'ledger-integrity', title: '거래 계산 무결성', description: '저장된 거래의 금액·상호명·시각 기본값을 검사합니다.',
      evidence: { passed: !invalidEntry, observedAt, summary: invalidEntry ? '필수 정보가 없는 거래가 있습니다.' : `거래 ${input.ledger.entries.length}건의 기본값 정상` },
    },
    {
      id: 'import-application', title: '가져오기 반영', description: '카드 CSV/Excel 또는 은행 PDF 가져오기 결과가 저장됐는지 확인합니다.',
      evidence: { passed: imported > 0, observedAt, summary: imported ? `가져온 거래 ${imported}건 저장됨` : '가져온 거래가 아직 없습니다.' },
    },
    {
      id: 'classification-application', title: '분류 반영', description: '분류된 거래가 예산 계산 대상에 저장됐는지 확인합니다.',
      evidence: { passed: classified > 0, observedAt, summary: classified ? `분류된 거래 ${classified}건 저장됨` : '분류된 거래가 아직 없습니다.' },
    },
    {
      id: 'evidence-preparation', title: '증빙 준비', description: '영수증과 거래증빙의 등록·연결 상태를 확인합니다.',
      evidence: { passed: receiptCount > 0 && linkedReceiptCount === receiptCount, observedAt, summary: receiptCount ? `영수증 ${receiptCount}개 중 ${linkedReceiptCount}개 연결됨` : '등록된 영수증이 없습니다.' },
    },
  ];
}

export const manualChecks = [
  { id: 'onboarding-restart', title: '온보딩 선택 보존', description: 'No 선택 후 강제 종료·재실행해도 대시보드가 유지되는지 확인합니다.' },
  { id: 'notification-visibility', title: '실제 결제 알림', description: '승인·취소 알림과 앱 알림이 기기 상단바에 올바르게 표시되는지 확인합니다.' },
  { id: 'import-accuracy', title: '가져오기 정확성', description: '카드 CSV/Excel 또는 은행 PDF의 실제 행과 앱 결과를 대조합니다.' },
  { id: 'backup-roundtrip', title: '백업·복원 왕복', description: '백업 파일을 새 설치 또는 초기화 환경에서 복원해 데이터가 일치하는지 확인합니다.' },
  { id: 'pdf-readability', title: '제출서류 품질', description: 'PDF의 표·모자이크·영수증이 사람이 읽을 수 있고 5MB 이하인지 확인합니다.' },
  { id: 'widget-visual', title: '홈 위젯 일치', description: '위젯 잔액·미정 건수·레이아웃이 앱과 일치하는지 확인합니다.' },
  { id: 'play-update', title: 'Play 업데이트 데이터 유지', description: '비공개 테스트 업데이트 뒤 정책·거래·규칙이 유지되는지 확인합니다.' },
] as const;

export function verificationReport(state: VerificationState, automatic: AutomaticCheck[], appInfo: { version: string; platform: string; generatedAt?: Date }) {
  const generatedAt = (appInfo.generatedAt ?? new Date()).toISOString();
  const automaticLines = automatic.map((check) => `${check.evidence.passed ? '자동 통과' : '자동 근거 없음'} | ${check.title} | ${check.evidence.summary} | ${check.evidence.observedAt}`);
  const manualLines = manualChecks.map((check) => {
    const decision = state.decisions[check.id];
    return `${decision?.status === 'passed' ? 'Yes · 통과' : decision?.status === 'failed' ? 'No · 실패' : '미확정'} | ${check.title}${decision?.note ? ` | 메모: ${sanitizeVerificationNote(decision.note)}` : ''}${decision ? ` | ${decision.decidedAt}` : ''}`;
  });
  return [
    '신청해 계산기 실기기 검증 결과',
    '개인정보 보호: 원문 알림, 상호명, 금액, 카드·계좌번호, 파일 원본은 포함하지 않습니다.',
    `생성 시각: ${generatedAt}`,
    `앱 환경: ${appInfo.version} / ${appInfo.platform}`,
    '',
    '[자동 확인]',
    ...automaticLines,
    '',
    '[사용자 확정]',
    ...manualLines,
  ].join('\n');
}
