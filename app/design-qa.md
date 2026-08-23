# Design QA — 지원금 관리 홈

- Source visual truth: `C:\Users\lAte\AppData\Local\Temp\codex-clipboard-e9357091-2599-45fb-b9f4-9e0ccb14762a.png`
- Implementation target: `app/src/App.tsx`
- Intended viewport: Android portrait, 393 × 852 CSS px (S25 Ultra may render at a different density)
- State: initial home screen

## Evidence and status

- The source image path could not be opened by the current sandbox.
- Browser capture tooling is not exposed in this environment.
- Android web-asset sync and debug APK build succeeded.
- At final verification, ADB reported no connected device, so a device screenshot could not be captured.

## Automated checks

- 11 Vitest tests passed, including home content, budget detail, undecided list, and settings opening.
- Web production build passed.
- Android debug APK build passed.

## Required fidelity surfaces

- Typography: system Korean font stack with high-weight title and compact tracking applied.
- Spacing/layout rhythm: single-column portrait layout, summary-first hierarchy, two budget rows, quick actions, and bottom primary action implemented.
- Colors/tokens: dark charcoal canvas, off-white text, muted gray labels, thin separators, and light primary action implemented.
- Image quality/assets: no non-standard visual image asset appears in the selected UI; standard UI icons use Phosphor icon components.
- Copy/content: selected home labels and confirmed 406,600원 / 293,400원 values applied.

## Findings

- [P1] Visual comparison is blocked until the user reconnects the S25 Ultra and confirms the installed screen, or a browser capture surface becomes available.

## Implementation checklist

- [x] Implement home UI and interactive panels.
- [x] Pass automated component and policy tests.
- [x] Build Android debug APK.
- [ ] Capture and compare S25 Ultra screen against source image.

final result: blocked