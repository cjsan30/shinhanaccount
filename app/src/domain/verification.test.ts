import { describe, expect, it } from 'vitest';
import { createEmptyLedger } from './ledger';
import { buildAutomaticChecks, createVerificationState, verificationReport } from './verification';

describe('verification checks', () => {
  it('treats receipt links as optional and unread statements as not ready', () => {
    const evidence = [{ id: 'r', section: 'receipt' as const, order: 0, stored: { id: 's', fileName: 'r.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-10-01' } }];
    const input = { storageReady: true, storageError: false, policyBook: { versions: [] }, ledger: createEmptyLedger(), evidence };
    expect(buildAutomaticChecks(input).find((item) => item.id === 'evidence-preparation')?.evidence.passed).toBe(true);
    expect(buildAutomaticChecks({ ...input, evidence: [...evidence, { ...evidence[0], id: 'pdf', section: 'statement', stored: { ...evidence[0].stored, fileName: 'bank.pdf', mimeType: 'application/pdf' }, statementParseFailed: true }] }).find((item) => item.id === 'evidence-preparation')?.evidence.passed).toBe(false);
  });

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
