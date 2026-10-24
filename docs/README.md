# 프로젝트 문서

현재 Android 앱의 개발·검증·배포에 필요한 문서를 이 디렉터리에서 관리합니다. 저장소 소개와 실행 방법은 [루트 README](../README.md)를 확인하세요.

## 먼저 읽을 문서

1. [현재 상태와 다음 작업](current_state.md): 진행 상황과 다음 작업의 유일한 인계 문서.
2. [최신 결정 사항](00-latest-decisions.md): 승인된 정책·기능 변경과 릴리스 기준.
3. [제품 요구사항](01-product-requirements.md), [기술 설계](02-technical-design.md): 제품 범위와 구현 구조.
4. [실기기 검증 체크리스트](10-device-verification-checklist.md), [검증·수정 결과](14-device-audit-remediation.md): 실제 확인 결과와 남은 검증.

PRD·기술 설계·초기 테스트 계획에는 이전 단계의 설명도 남아 있습니다. 현재 규칙을 판단할 때는 최신 결정 기록과 실제 소스·테스트를 함께 확인합니다. 날짜가 있는 과거 결과를 현재 버전의 검증 완료로 간주하지 않습니다.

## 개발·보안 기준

| 문서 | 보존 이유 |
| --- | --- |
| [최신 결정 사항](00-latest-decisions.md) | 정책 변경과 승인 이력의 기준 |
| [제품 요구사항](01-product-requirements.md) | 제품 범위·사용 흐름·데이터 처리 기준 |
| [기술 설계](02-technical-design.md) | 앱·네이티브·저장소의 구조와 계약 |
| [TDD·테스트 계획](03-tdd-test-plan.md) | 자동 테스트와 병합 전 검증 기준 |
| [AI·개인정보 가드레일](04-ai-guardrails.md) | 민감정보와 외부 AI 사용 제한 |
| [GitHub 가드레일](05-github-guardrails.md) | 브랜치·커밋·비밀정보 취급 원칙 |
| [의존성 보안 기준](13-dependency-security.md) | 파일 파서 버전 고정과 입력 방어 근거 |

## 검증·개선 계획

| 문서 | 보존 이유 |
| --- | --- |
| [실기기·릴리스 체크리스트](07-device-release-checklist.md) | 배포 전 공통 검증 절차 |
| [최신 실기기 확인 체크리스트](10-device-verification-checklist.md) | 변경별 사용자 검증 항목과 실행 결과 |
| [실기기 검증 후 수정 결과](14-device-audit-remediation.md) | 구현·회귀 테스트·기기 검증의 근거 |
| [제출 PDF 생성 성능 측정](15-pdf-benchmark.md) | 영수증 압축 방식 변경 전후의 실기기 처리 시간·PDF 크기 원자료 |
| [제출서류·거래내역 개선 기록](09-pdf-submission-improvement-plan.md) | PDF·OCR·가져오기 피드백과 확정된 동작 |
| [후속 개선 계획](06-future-enhancements.md) | 과거 보류·제안 항목의 추적; 현재 착수 전 최신 결정과 구현 여부 확인 |
| [현재 상태와 다음 작업](current_state.md) | 진행 상황·다음 작업 인계의 단일 기준 |
| [리팩터링 계획](08-refactoring-plan.md) | 기능 변경과 분리한 구조 개선 과제 |

## Google Play·개인정보

| 문서 | 보존 이유 |
| --- | --- |
| [최신 등록 패키지](11-play-console-registration-pack.md) | 릴리스 정보·출시 노트·정책 대응 문구 |
| [Console 제출 자료](10-play-console-submission.md) | 초기 등록·과거 업데이트·자산 준비 참고 |
| [개인정보 고지 초안](09-play-release-privacy-draft.md) | 권한·저장·삭제·Data safety 작성 근거 |
| [공개 개인정보처리방침](privacy-policy.html) | 실제 공개용 HTML; 공개 URL 유지를 위해 경로 보존 |

등록 자료와 개인정보 고지의 초안은 현재 Console 설정·실제 배포본과 대조한 뒤 사용합니다. 초안을 보관하는 것만으로 제출·정책 승인이 완료된 것은 아닙니다.

## 제거한 과거 문서

2026-10-11에 다음 루트 문서를 정리했습니다.

- Notion 템플릿 제작 지시서·검수표·설계서 3개: 현재 앱은 Notion 템플릿을 구축하거나 동기화하지 않으므로 제외.
- 초기 앱 문서 목차·PRD·기술 설계·백로그 4개: 이 디렉터리의 문서가 역할을 대체하며, 오래된 기간·권한·배포 기준의 혼동을 방지하기 위해 제외.

별도 아카이브 복사본은 만들지 않습니다. 과거 원문이 필요하면 Git 이력에서 확인·복구할 수 있습니다. 개인 거래 자료·영수증·서명키·APK/AAB·로컬 검증 산출물은 문서 디렉터리나 Git에 넣지 않습니다.
