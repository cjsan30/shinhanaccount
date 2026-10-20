# 현재 상태와 다음 작업

이 파일은 진행 상황 인계의 유일한 기준이다. 세션을 끝낼 때마다 갱신한다.
결정 이력은 [00-latest-decisions.md](00-latest-decisions.md), 구조 개선의 배경은 [08-refactoring-plan.md](08-refactoring-plan.md)에 둔다.

- 마지막 갱신: 2026-10-21
- 기준 커밋: `dev` `0133986` (+ `chore/cleanup-and-handoff` PR 병합 대기)

## 현재 상태 요약

| 항목 | 상태 |
| --- | --- |
| 배포 | Play 비공개 테스트. 서명 AAB 1.3.7 / code 11 생성 완료(`56ae425` 기준, Git 제외 `audit/release-1.3.7/`). 업로드 전 |
| 웹 테스트 | 445개 중 443개 통과, 1개 실패, 1개 건너뜀(내부 전용) — 실패 원인은 아래 작업 1 |
| 린트·타입체크 | 통과 |
| `npm audit --omit=dev` | `@capacitor/android` 8.4.2에 critical 취약점 1건 — 아래 작업 2 |
| 브랜치 | `dev`를 `main`(`0133986`)으로 fast-forward해 이력을 맞췄다(2026-10-21) |
| Android 단위 테스트 | 27개 통과(예제 테스트 1개 삭제 후) |

## 진행 상황

### 2026-10-21 사전 준비·작업 0 (Claude Code)

- 사전 준비 완료: 로컬 `dev`를 만들고 `origin/main`을 병합(fast-forward)해 `origin/dev`에 푸시했다.
- 작업 0 완료: `chore/cleanup-and-handoff`에서 미사용 파일 9개를 `git rm`하고 `CLAUDE.md`, 이 문서, `docs/README.md`를 커밋했다. 사용자 승인에 따라 `05-github-guardrails.md`에 `refactor/*`, `chore/*` 접두사를 추가했다.
- 검증: lint·build·test:security 통과, Android 단위 테스트 27개 통과. `test:run`은 작업 1의 알려진 실패 1건(`App.test.tsx` 시간 의존 테스트)만 남아 있다.
- 로컬 환경 메모: 새 체크아웃에서는 Gradle 전에 `npm run android:sync`가 필요하다(`capacitor-cordova-android-plugins` 생성). 셸 기본 Java가 8이라 `JAVA_HOME`을 `C:\Program Files\Android\Android Studio\jbr`로, `ANDROID_HOME`을 `%LOCALAPPDATA%\Android\Sdk`로 지정해야 한다. sync 후 생기는 gradle 파일의 줄바꿈 변경은 커밋하지 않는다.
- `core.hooksPath`가 설정돼 있지 않아 pre-push 훅이 실행되지 않는다. 작업 1로 테스트가 통과한 뒤 설정을 권장한다.

### 2026-10-20 분석 세션 (Cowork)

- 저장소 전체 구조, 테스트, 린트, 의존성 보안을 점검했다.
- 아래 작업 0~8을 도출했고 사용자가 방향을 승인했다. 아직 코드 변경은 하지 않았다.
- `CLAUDE.md`와 이 문서를 작업 트리에 새로 추가했다(아직 커밋 전, 작업 0에서 커밋).

## 다음 작업

번호 순서대로 진행한다. 각 작업은 `dev`에서 브랜치를 새로 만들고 PR로 `dev`에 병합한다.

### ~~사전 준비: dev 이력 맞추기~~ (2026-10-21 완료)

`main`에만 있는 병합 커밋을 `dev`로 가져와 이력을 맞춘다. 파일 내용은 같으므로 충돌은 없다.

```powershell
git switch dev
git pull
git merge origin/main
git push
```

### ~~0. `chore/cleanup-and-handoff` — 미사용 파일 정리와 인계 문서 커밋~~ (2026-10-21 완료, PR 병합 대기)

**삭제할 파일**: 저장소 전체에서 참조가 없음을 grep으로 확인했다.

| 파일 | 이유 |
| --- | --- |
| `app/src/assets/react.svg` | Vite 템플릿 잔여물 |
| `app/src/assets/vite.svg` | Vite 템플릿 잔여물 |
| `app/src/assets/hero.png` | Vite 템플릿 잔여물 |
| `app/public/icons.svg` | Vite 템플릿 잔여물 |
| `app/public/onboarding-applicant-policy.svg` | 2026-08-27 추가 후 한 번도 참조되지 않음 |
| `app/public/onboarding-applicant-yes.svg` | 위와 같음 |
| `app/public/onboarding-not-applicant.svg` | 위와 같음 |
| `app/android/app/src/test/java/com/getcapacitor/myapp/ExampleUnitTest.java` | Capacitor 템플릿 예제 테스트 |
| `app/android/app/src/androidTest/java/com/getcapacitor/myapp/ExampleInstrumentedTest.java` | Capacitor 템플릿 예제 테스트 |

`favicon.svg`와 `onboarding-policy-example.png`는 사용 중이므로 남긴다.

**함께 처리할 것**

- `CLAUDE.md`, `docs/current_state.md`, `docs/README.md`(목차에 이 문서 추가)를 커밋한다.
- `docs/05-github-guardrails.md`에 `refactor/*`, `chore/*` 브랜치 접두사를 추가한다. CLAUDE.md에는 이미 반영돼 있으므로 사용자 확인 후 맞춘다.

**완료 기준**

- `git rm`으로 삭제한 뒤 lint, test:run, build, test:security가 통과한다.
- `:app:testDebugUnitTest`가 통과한다. 예제 테스트 1개가 빠지므로 Android 테스트 수는 기존 28개에서 줄어든다.

### 1. `fix/test-policy-gap-clock` — 시간에 따라 실패하는 테스트

**위치**: `App.test.tsx`의 `acknowledges but does not store an approval outside the confirmed policy period`

**원인**

- 테스트는 `2026-09` 정책(9/15~10/10)과 공백 구간(10/12)의 승인을 고정값으로 쓰는데, 앱은 실제 오늘 날짜로 현재 기간을 정한다.
- 10/15 이후에는 현재 기간이 `2026-10`이 된다. 확정된 정책이 없으므로 `App.tsx`의 `if (!activePolicy.confirmed) return;`에서 승인 처리 자체가 실행되지 않는다.
- 앱 버그가 아니라 테스트가 시스템 시간에 영향을 받는 문제다.

**수정**: 테스트 시작 부분에 아래 두 줄을 추가한다. Cowork 세션에서 추가 후 통과하는 것을 확인했다.

```ts
vi.useFakeTimers({ toFake: ['Date'] });
vi.setSystemTime(new Date('2026-10-12T12:00:00+09:00'));
```

**추가 확인**: `new Date()`에 의존하는 다른 App 테스트가 있는지 찾아 같은 방식으로 시간을 고정한다.

### 2. `fix/capacitor-cve-2026-103922` — Capacitor 보안 패치

**문제**

- CVE-2026-103922(GHSA-rvm3-566m-v7fv), CVSS 9.3.
- WebView의 이동 검사가 경로를 확인하지 않아, 내부 프록시 경로 `/_capacitor_http_interceptor_`를 통해 외부 콘텐츠가 앱 출처에서 실행될 수 있다. 실행되면 등록된 플러그인과 저장소 전체에 접근할 수 있다.

**이 앱의 노출 정도**: 링크는 공식 출처 2개뿐이고 외부 브라우저에서 열린다. `dangerouslySetInnerHTML`이 없고 `server.url`·`allowNavigation` 설정도 없다. 즉시 악용될 경로는 확인되지 않았지만 피해가 크므로 패치한다.

**수정**

- `@capacitor/android`, `@capacitor/core`, `@capacitor/cli`를 8.4.3 이상으로 올린다. 8.5.x로 갈 경우 8.5.1 이상이어야 한다.
- `npm run android:sync`를 실행한다.

**완료 기준**

- `npm audit --omit=dev` 결과 0건, 웹·Android 테스트 통과.
- 실기기 회귀 확인: 알림 인식, 위젯, 파일 저장, PDF 생성.
- 이후 릴리스는 versionCode 12로 다시 빌드한다. 1.3.7(code 11) AAB에는 8.4.2가 들어 있으므로 업로드하지 않는다. 빌드는 사용자가 직접 한다.

### 3. `refactor/period-selectors` — 기간·집계 계산 통일

- 대시보드, 결제 목록, 알림 동기화, 위젯 스냅샷이 각자 거래를 필터링하던 코드를 `domain/`의 순수 선택자로 통일한다. 예: `selectEntriesInPeriod`, `selectSpentByBucket`.
- 선택자는 오늘 날짜를 `now` 인자로 받는다.
- 화면 컴포넌트에서 `periodKey` 문자열을 직접 비교하지 않는다.

### 4. `refactor/app-split-*` — App.tsx 기능별 분리

- 현재 `App.tsx`는 80KB, `useState` 52개, `useEffect` 21개이고 패널 23개의 JSX를 모두 갖고 있다.
- `features/payments`, `policy`, `rules`, `settings`, `evidence`로 화면과 훅을 옮긴다. 기능 하나당 PR 하나로 진행한다.
- 승인 대기열 처리(`processPendingApprovals`)는 `useApprovalSync` 훅과 순수 함수(기간 필터 → 원장 반영 → 저장 → ack 대상 결정)로 분리해 App 없이 테스트한다.
- 저장 데이터 형식과 화면 동작은 바꾸지 않는다.

### 5. `refactor/evidence-pipeline` — 증빙 PDF의 UI와 연산 분리

- `EvidenceExport.tsx`(65KB)에서 OCR, 압축, PDF 렌더링, 은행 PDF 행 가리기(`statementTableGeometry`, `solidMask`, `cleanRowMask`), 조립 로직을 `features/evidence/pipeline/`의 순수 모듈로 옮긴다.
- 가리기 좌표 계산에 대한 단위 테스트를 추가한다.
- UI는 진행률, 취소, 결과만 받는다.

### 6. `fix/remove-builtin-merchant-rules` — 개인용 기본 분류 규칙 삭제

사용자가 방향을 승인했다. 작업 전에 `00-latest-decisions.md`에 결정을 기록한다.

**배경**: `domain/sms.ts`의 `classifyPayment`와 Kotlin `classifyForBudget`에 초기 개인 결제 패턴이 하드코딩돼 있다. 다른 테스터에게는 잘못된 자동 분류가 된다.

| 상호 | 현재 분류 |
| --- | --- |
| 삼성웰스토리 8,000원 | 식비 |
| 삼성웰스토리 그 외 | 일반카페 |
| 서브웨이·써브웨이·맘스터치·맥도날드 | 일반카페 |
| 놀유니버스 | 숙박 |
| SR | 교통비 |
| 아이햅슨 | 제외 |

**수정**

- 사용자 규칙이 없으면 `classifyPayment`가 `undecided`를 반환하게 한다. Kotlin 하드코딩도 삭제한다.
- 테스트 픽스처를 "사용자 규칙을 등록한 상태"로 바꾼다. 대상: `sms.test.ts`, `App.test.tsx`, `ledger.test.ts`, `shinhanImport.test.ts`, `SmsApprovalParserTest.kt`.
- 문서 01(103~108행), 03(98~100행), 00의 해당 규칙 서술을 정리한다.
- 아이햅슨은 문서에 "미정 처리 후 사용자 제외"로 적혀 있는데 코드는 즉시 제외한다. 이 불일치도 함께 해소된다.

**사용자 영향**: 이미 저장된 내역은 그대로다. 업데이트 후 이 상호들은 미정으로 들어오므로 필요하면 앱에서 직접 규칙을 등록한다.

### 7. `refactor/native-rule-snapshot` — Kotlin·TS 규칙 단일화

작업 6 이후에 진행한다.

**문제**: 앱이 꺼져 있을 때의 즉시 예산 경고(`consumeBudgetAlert`)는 Kotlin 규칙으로 계산한다. 사용자 규칙이 반영되지 않아 경고가 누락되거나 엉뚱한 카테고리로 울린다.

**수정**

- `syncBudgetState`에 최종 규칙 목록(사용자 규칙)을 함께 보낸다. Kotlin은 그 스냅샷만으로 분류한다.
- 기간(`isApprovalInPolicyPeriod`), 분류, 경고 기준 경계값에 대해 공유 테스트 벡터 JSON을 만든다. Vitest와 Android Unit Test가 같은 파일을 읽어 검증한다.
- 공유 벡터에 넣을 사례: 공백 구간, 월말 31일, 경고 기준 경계.

**완료 기준**: 실기기에서 앱을 끈 상태로 사용자 규칙 가맹점 결제 → 올바른 카테고리 경고가 오는지 확인한다.

### 8. `refactor/css-modules` — CSS 정리

작업 4 이후에 진행한다.

- `App.css`, `AppOverrides.css`(`!important` 16개), `AppFixes.css`(압축된 한 줄 규칙)를 컴포넌트 단위 CSS로 옮긴다.
- 색과 간격은 CSS 변수로 통일한다.
- 큰 글자·접근성 화면 회귀를 실기기에서 확인한다.

## 작은 정리 후보

필요할 때 해당 작업에 묶어서 처리한다.

- `app/index.html`: `lang="en"`을 `ko`로, `<title>app</title>`을 `신청해 계산기`로 바꾼다.
- `app/package.json`의 `version` `0.0.0`을 Android versionName과 맞춘다.
- `npm audit --omit=dev`를 `test:security` 또는 pre-push 훅에 추가한다.

## 사용자 결정이 필요한 항목

- 작업 2 이후 1.3.8 / code 12 릴리스를 언제 만들지
