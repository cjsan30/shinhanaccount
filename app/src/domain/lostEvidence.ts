/** Error code used when the app's own copy of an attachment no longer exists. */
export const EVIDENCE_NOT_FOUND = 'EVIDENCE_NOT_FOUND';

/** Only a confirmed "file is gone" counts; other read errors may be temporary and keep the attachment. */
export function isEvidenceNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === EVIDENCE_NOT_FOUND;
}

/** Adds payments whose receipt link was lost, without duplicates. */
export function addLostReceiptLinks(current: string[], entryIds: string[]): string[] {
  return [...new Set([...current, ...entryIds])];
}

/**
 * Keeps only payments that still have no receipt. A payment drops out once it is linked again
 * or is no longer one of this report's payments.
 */
export function pendingLostReceiptLinks(lost: string[], unlinkedPaymentIds: string[]): string[] {
  const unlinked = new Set(unlinkedPaymentIds);
  return lost.filter((id) => unlinked.has(id));
}
