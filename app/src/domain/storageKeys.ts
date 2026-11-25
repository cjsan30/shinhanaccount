/**
 * Every localStorage key the app uses, in one place. The main data (ledger, plans,
 * rules, report evidence) lives in the encrypted database; localStorage keeps only
 * small values listed here. A test fails when a key string appears anywhere else.
 *
 * - `legacy`: plaintext copies from before the encrypted database. Read once to move them, then removed.
 * - `side`: small values that are not part of a backup and survive a data reset.
 * - `verify`: used by the device verification build only.
 */
export const LOCAL_STORAGE_KEYS = {
  legacyLedger: { key: 'shinhanhae-ledger-v1', kind: 'legacy', holds: '결제 원장(암호화 저장소 이전 전)' },
  legacyPolicy: { key: 'shinhanhae-policy-v1', kind: 'legacy', holds: '정책 하나(계획표 이력 이전 전)' },
  legacyPolicyBook: { key: 'shinhanhae-policy-book-v1', kind: 'legacy', holds: '계획표 이력(암호화 저장소 이전 전)' },
  legacyMerchantRules: { key: 'shinhanhae-merchant-rules-v1', kind: 'legacy', holds: '자동 분류 규칙(암호화 저장소 이전 전)' },
  legacyReportEvidence: { key: 'shinhanhae-report-evidence-v1', kind: 'legacy', holds: '사용보고서 첨부 목록(암호화 저장소 이전 전)' },
  accessibility: { key: 'shinhanhae-accessibility-v1', kind: 'side', holds: '글자 크기·진동 설정' },
  appInformationConfirmed: { key: 'shinhanhae-app-information-confirmed-v1', kind: 'side', holds: '앱 안내 확인 여부' },
  onboardingProgress: { key: 'shinhanhae-onboarding-progress-v1', kind: 'side', holds: '마치지 않은 온보딩 단계' },
  forceStopRecoveryDismissed: { key: 'shinhanhae-force-stop-recovery-dismissed-v1', kind: 'side', holds: '닫은 강제 종료 복구 안내' },
  evidencePendingRemoval: { key: 'shinhanhae-evidence-pending-removal-v1', kind: 'side', holds: '다시 지울 증빙 파일 id' },
  lostReceiptLinks: { key: 'shinhanhae-lost-receipt-links-v1', kind: 'side', holds: '원본을 잃어 연결이 풀린 결제 id' },
  recentReports: { key: 'shinhanhae-recent-reports-v1', kind: 'side', holds: '최근 만든 사용보고서 목록' },
  verifyDateOffset: { key: 'shinhanhae-verify-date-offset-v1', kind: 'verify', holds: '검증 앱의 오늘 날짜 바꾸기' },
} as const satisfies Record<string, { key: string; kind: 'legacy' | 'side' | 'verify'; holds: string }>;
