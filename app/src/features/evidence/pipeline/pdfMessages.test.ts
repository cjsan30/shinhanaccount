import { describe, expect, it } from 'vitest';
import { isPdfPasswordError, statementOpenError, STATEMENT_PASSWORD_MISMATCH } from './pdfErrors';
import { summaryRemainLabel } from './summaryText';

const passwordException = (message: string) => Object.assign(new Error(message), { name: 'PasswordException' });

describe('statement PDF open errors', () => {
  it('replaces pdf.js password errors with a Korean message', () => {
    expect(isPdfPasswordError(passwordException('Incorrect Password'))).toBe(true);
    const mapped = statementOpenError(passwordException('Incorrect Password'));
    expect(mapped).toBeInstanceOf(Error);
    expect((mapped as Error).message).toBe(STATEMENT_PASSWORD_MISMATCH);
    expect((statementOpenError(passwordException('No password given')) as Error).message).toBe(STATEMENT_PASSWORD_MISMATCH);
  });

  it('passes other failures through unchanged', () => {
    const broken = new Error('Invalid PDF structure');
    expect(isPdfPasswordError(broken)).toBe(false);
    expect(statementOpenError(broken)).toBe(broken);
    expect(statementOpenError('text')).toBe('text');
    expect(isPdfPasswordError(null)).toBe(false);
  });
});

describe('summary remaining label', () => {
  it('shows the remaining amount while budget is left', () => {
    expect(summaryRemainLabel(700000, 165162)).toBe('잔액 534,838원');
  });

  it('reports an exhausted budget only when a plan exists', () => {
    expect(summaryRemainLabel(700000, 700000)).toBe('지원금 소진');
    expect(summaryRemainLabel(700000, 710000)).toBe('지원금 소진');
  });

  it('does not call an unplanned period exhausted', () => {
    expect(summaryRemainLabel(0, 0)).toBe('확정된 계획 없음');
    expect(summaryRemainLabel(0, 5000)).toBe('확정된 계획 없음');
  });
});
