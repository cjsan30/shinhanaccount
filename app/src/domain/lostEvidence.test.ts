import { describe, expect, it } from 'vitest';
import { EVIDENCE_NOT_FOUND, addLostReceiptLinks, isEvidenceNotFound, pendingLostReceiptLinks } from './lostEvidence';

describe('lost evidence', () => {
  it('treats only the not-found code as a missing original', () => {
    expect(isEvidenceNotFound(Object.assign(new Error('gone'), { code: EVIDENCE_NOT_FOUND }))).toBe(true);
    expect(isEvidenceNotFound(new Error('read failed'))).toBe(false);
    expect(isEvidenceNotFound(undefined)).toBe(false);
  });

  it('adds lost links once and keeps only payments that are still unlinked', () => {
    expect(addLostReceiptLinks(['a'], ['a', 'b'])).toEqual(['a', 'b']);
    expect(pendingLostReceiptLinks(['a', 'b', 'c'], ['b', 'x'])).toEqual(['b']);
  });
});
