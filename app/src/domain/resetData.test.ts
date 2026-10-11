import { describe, expect, it } from 'vitest';
import { resetAppData, type ResetScope } from './resetData';
import type { PersistedAppState } from '../native/encryptedStore';
import { createPolicyBook, parsePolicyText } from './policy';
import { createMerchantRule } from './merchantRules';
const state: PersistedAppState = {
  ledger: { entries: [{ id: 'p', amount: 1000, merchant: 'sample', occurredAt: '2026-10-01T12:00:00+09:00', cardLast4: '1234', status: 'undecided' }], alertThresholds: [50, 80] },
  policyBook: createPolicyBook(parsePolicyText('식비 200000원 교육비 160000원 교통비 140000원 카페 200000원'), new Date('2026-10-01T12:00:00+09:00')),
  merchantRules: [createMerchantRule('sample', { bucket: 'resident', category: 'food' })],
  reportEvidence: [{ id: 'r', section: 'receipt', order: 0, linkedEntryId: 'p', stored: { id: 's', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-10-01' } }],
};
describe('selective reset combinations', () => {
  it.each(Array.from({ length: 8 }, (_, mask) => [mask]))('preserves unselected scopes (mask %i)', (mask) => {
    const scopes = (['ledger', 'rules', 'policy'] as ResetScope[]).filter((_, index) => mask & (1 << index));
    const result = resetAppData(state, scopes);
    expect(result.ledger.entries.length).toBe(scopes.includes('ledger') ? 0 : 1);
    expect(result.merchantRules === state.merchantRules).toBe(!scopes.includes('rules'));
    expect(result.merchantRules).toHaveLength(scopes.includes('rules') ? 0 : 1);
    expect(result.policyBook === state.policyBook).toBe(!scopes.includes('policy'));
    expect(result.policyBook.versions).toHaveLength(scopes.includes('policy') ? 0 : 1);
    expect(result.reportEvidence?.[0].linkedEntryId).toBe(scopes.includes('ledger') ? undefined : 'p');
    expect(result.reportEvidence?.[0].stored).toBe(state.reportEvidence?.[0].stored);
    expect(state.ledger.entries).toHaveLength(1);
  });
});
