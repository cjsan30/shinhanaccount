export const STATEMENT_PASSWORD_MISMATCH = '입출금내역 PDF 비밀번호가 맞지 않습니다. 비밀번호를 다시 입력해 주세요.';

/** pdf.js rejects a protected or wrongly unlocked document with a PasswordException whose message is English. */
export function isPdfPasswordError(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'PasswordException';
}

/**
 * The statement table was read with the right password, but the password field
 * now holds a different value when the PDF is generated. Show a Korean message
 * the user can act on instead of pdf.js's own text.
 */
export function statementOpenError(error: unknown) {
  return isPdfPasswordError(error) ? new Error(STATEMENT_PASSWORD_MISMATCH) : error;
}
