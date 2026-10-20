# CLAUDE.md

신청해 지원금의 예산 사용 현황 관리와 증빙 준비를 돕는 Android 앱 **신청해 계산기**의 작업 지침이다.
React + TypeScript 화면을 Capacitor로 감싸고, 결제 알림·위젯·파일 저장은 Kotlin/Java 네이티브 플러그인이 맡는다. 서버 없이 기기 안에서만 동작한다.

## 세션을 시작하면 먼저 할 일

1. [`docs/current_state.md`](docs/current_state.md)를 읽는다. 어디까지 했고 다음에 무엇을 할지는 이 파일에만 기록한다.
2. 작업 전에 [`docs/04-ai-guardrails.md`](docs/04-ai-guardrails.md)와 [`docs/05-github-guardrails.md`](docs/05-github-guardrails.md)를 확인한다.
3. 정책·동작 규칙을 판단할 때는 [`docs/00-latest-decisions.md`](docs/00-latest-decisions.md)와 실제 소스·테스트를 기준으로 삼는다. PRD(01)·기술 설계(02)·테스트 계획(03)에는 이전 단계 설명이 남아 있을 수 있다.

## 저장소 구조

```text
app/
  src/
    App.tsx               최상위 상태·화면 전환 (분리 진행 중, current_state 참고)
    domain/               순수 비즈니스 로직: 정책 기간, 원장, 예산, 가져오기, 분류, 마스킹
    native/               Capacitor 플러그인 브리지와 암호화 저장소
    components/           패널 단위 UI
    features/             기능별 화면 (dashboard, evidence부터 이전 중)
  android/app/src/main/java/io/github/cjsan30/shinhanhae/calculator/
                          알림 리스너, 승인 파서(SmsBridgePlugin.kt), 위젯, OCR, 파일 저장
  scripts/                security-check.cjs, capacitor-safe-userinfo.cjs
  vendor/xlsx-0.20.3.tgz  보안 패치된 SheetJS 고정본 (docs/13 참고, 교체 금지)
docs/                     결정·요구사항·설계·검증·Play 제출 문서 (목차: docs/README.md)
store-assets/             Play 스토어 그래픽
```

## 명령어

모든 웹 명령은 `app/`에서 실행한다. 개발 환경은 Windows PowerShell이다.

| 목적 | 명령 |
| --- | --- |
| 의존성 설치 | `npm ci` |
| 웹 테스트 전체 | `npm run test:run` |
| 단일 테스트 | `npx vitest run src/domain/policy.test.ts -t "테스트 이름"` |
| 린트 | `npm run lint` |
| 타입체크 + 빌드 | `npm run build` |
| 소스 보안 검사 | `npm run test:security` |
| 의존성 취약점 | `npm audit --omit=dev` |
| Android 동기화 | `npm run android:sync` |
| Android 단위 테스트 | `app/android`에서 `.\gradlew.bat :app:testDebugUnitTest` |
| Android 디버그 APK | `app/android`에서 `.\gradlew.bat :app:assembleDebug` |

`.githooks/pre-push`가 푸시 전에 lint, test:run, build를 실행한다(`git config core.hooksPath .githooks`).

## 작업 완료 기준

- 변경 후 `npm run lint`, `npm run test:run`, `npm run build`, `npm run test:security`를 모두 통과해야 한다.
- Kotlin/Java를 바꿨다면 Android 단위 테스트까지 통과해야 한다.
- 결제 알림, 위젯, 파일 저장, PDF 생성처럼 기기에 의존하는 변경은 자동 테스트만으로 완료 처리하지 않는다. `docs/10-device-verification-checklist.md`에 실기기 확인 항목을 추가하고 사용자 확인을 요청한다.
- 실패한 테스트를 건너뛰거나(`skip`) 기대값을 바꿔 통과시키지 않는다. 원인을 먼저 설명한다.

## 브랜치·커밋

- `main`에 직접 커밋하거나 푸시하지 않는다. `dev`에서 브랜치를 만들어 PR로 `dev`에 병합한다.
- 브랜치 접두사: `fix/*`, `feat/*`. 구조 개선은 `refactor/*`, 정리 작업은 `chore/*`를 쓴다.
- 한 브랜치와 한 커밋에는 한 가지 목적만 담는다. 리팩터링과 기능 변경을 섞지 않는다.
- 커밋 메시지는 Conventional Commits 영문 타입 + 한국어 설명으로 쓴다. 예: `fix(test): 정책 공백 기간 테스트의 시스템 시간 고정`
- 커밋 작성자는 사용자 git 설정을 사용한다.
- 커밋 전에 `git status`로 의도한 파일만 포함됐는지 확인한다.

## 절대 하지 말 것

- `.env`, API 키, 서명키, keystore, `keystore.properties`, APK/AAB, `audit/` 산출물을 커밋하지 않는다.
- 원문 결제 알림, 실제 카드·계좌 번호(끝 4자리 포함), 승인번호, 개인 영수증을 코드, 테스트 픽스처, 로그, 프롬프트에 넣지 않는다. 픽스처는 마스킹한 최소 데이터만 쓴다.
- 앱 실행 기능에 AI 모델이나 외부 AI API를 붙이지 않는다.
- 서명 비밀번호를 묻거나 파일에 저장하지 않는다. 릴리스 빌드(`build-play-release.ps1`)는 사용자가 직접 실행한다.
- Play Console 업로드, 제출, 배포는 하지 않는다.
- `READ_SMS`나 `RECEIVE_SMS` 권한을 추가하지 않는다. 결제 인식은 알림 접근으로만 한다.

## 코드 규칙

- 계산·판정 로직은 `domain/`의 순수 함수로 작성하고 같은 이름의 `*.test.ts`를 함께 둔다.
- 정책 기간은 기본값이 15일 시작, 다음 달 10일 종료이고 그 사이에 공백 구간이 있다. 날짜를 직접 문자열로 비교하지 말고 `domain/budget.ts`, `domain/policy.ts`의 함수를 사용한다.
- 현재 날짜에 의존하는 테스트는 `vi.useFakeTimers({ toFake: ['Date'] })`와 `vi.setSystemTime(...)`으로 시간을 고정한다.
- 불확실한 결제는 자동으로 차감하지 않고 `미정 지출`로 남겨 사용자가 판단하게 한다.
- 분류·기간·경고 기준 계산을 Kotlin에 새로 추가하지 않는다. 최종 분류와 집계는 TypeScript가 맡는다(`docs/08-refactoring-plan.md`).
- 사용자에게 보이는 문구, 정책, 동작을 바꾸는 결정은 사용자 승인을 받은 뒤 `docs/00-latest-decisions.md` 맨 위에 날짜와 함께 기록한다.

## 작업을 마칠 때

`docs/current_state.md`의 "진행 상황"과 "다음 작업"을 갱신한다. 완료한 작업, 남은 작업, 확인이 필요한 실기기 항목, 사용자 결정이 필요한 항목을 적는다.
