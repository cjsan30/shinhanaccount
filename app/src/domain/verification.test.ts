import { describe, expect, it } from 'vitest';
import { createEmptyLedger } from './ledger';
import { buildAutomaticChecks, createVerificationState, verificationReport } from './verification';

describe('verification checks', () => {
  it('creates privacy-safe automatic evidence from saved app state', () => {
    const checks = buildAutomaticChecks({ storageReady: true, storageError: false, policyBook: { versions: [], mode: 'not-applicant' }, ledger: createEmptyLedger(), evidence: [], now: new Date('2026-09-30T00:00:00.000Z') });
    expect(checks.find((check) => check.id === 'encrypted-storage')?.evidence.passed).toBe(true);
    expect(checks.find((check) => check.id === 'policy-state')?.evidence.summary).toContain('비지원자');
  });

  it('exports only summaries and manual decisions', () => {
    const report = verificationReport({ ...createVerificationState(), decisions: { 'onboarding-restart': { status: 'passed', decidedAt: '2026-09-30T00:00:00.000Z', note: '1234원 결제 화면 이상' } } }, [], { version: 'internal', platform: 'Android', generatedAt: new Date('2026-09-30T00:00:00.000Z') });
    expect(report).toContain('Yes · 통과 | 온보딩 선택 보존');
    expect(report).not.toContain('1234원');
    expect(report).toContain('[가림]');
  });
});
