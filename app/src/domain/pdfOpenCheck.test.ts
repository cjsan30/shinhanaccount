import { describe, expect, it } from 'vitest';
import { pdfOpenFailure } from './pdfOpenCheck';

describe('pdfOpenFailure', () => {
  it('tells a locked PDF from a wrong password', () => {
    expect(pdfOpenFailure({ name: 'PasswordException', code: 1 })).toBe('needs-password');
    expect(pdfOpenFailure({ name: 'PasswordException', code: 2 })).toBe('wrong-password');
  });

  it('treats every other failure as a file that cannot be opened', () => {
    expect(pdfOpenFailure({ name: 'InvalidPDFException' })).toBe('unreadable');
    expect(pdfOpenFailure(new Error('broken'))).toBe('unreadable');
    expect(pdfOpenFailure(null)).toBe('unreadable');
    expect(pdfOpenFailure('text')).toBe('unreadable');
  });
});
