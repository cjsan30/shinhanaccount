/** What happened when a PDF was opened before it was attached (decision 2026-11-17). */
export type PdfOpenCheck = 'open' | 'needs-password' | 'wrong-password' | 'unreadable';

// pdf.js PasswordResponses: NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2.
const INCORRECT_PASSWORD = 2;

/**
 * Sorts a pdf.js open failure. A locked file and a wrong password come back as
 * PasswordException; anything else (broken file, not a PDF) cannot be fixed with a password.
 */
export function pdfOpenFailure(error: unknown): Exclude<PdfOpenCheck, 'open'> {
  const failure = error as { name?: unknown; code?: unknown } | null;
  if (failure?.name !== 'PasswordException') return 'unreadable';
  return failure.code === INCORRECT_PASSWORD ? 'wrong-password' : 'needs-password';
}
