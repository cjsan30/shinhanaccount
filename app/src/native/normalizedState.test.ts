import { describe, expect, it } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';
import type { PersistedAppState } from './encryptedStore';
import { changedRows, denormalizeAppState, normalizeAppState } from './normalizedState';

const state: PersistedAppState = {
  ledger: { ...createEmptyLedger(), entries: [{ id: 'one', cardLast4: '3741', occurredAt: '2026-08-19T12:00:00+09:00', amount: 5000, merchant: '카페', status: 'undecided' }] },
  policyBook: { versions: [{ periodKey: '2026-08', confirmedAt: '2026-08-10T00:00:00.000Z', sourceText: 'test', plans: { housing: 0, food: 1, education: 0, transport: 0, studyCafe: 0, cafe: 2, readingRoom: 0 } }] },
  merchantRules: [],
};

describe('normalized encrypted state', () => {
  it('round-trips ledger, policy, settings and rules without changing order', () => {
    expect(denormalizeAppState(normalizeAppState(state))).toEqual(state);
  });

  it('updates only changed rows and identifies removed rows', () => {
    const previous = [{ id: 'one', value: '{"amount":1}', position: 0 }, { id: 'two', value: '{"amount":2}', position: 1 }];
    const next = [{ id: 'one', value: '{"amount":3}', position: 0 }];
    expect(changedRows(previous, next)).toEqual({ upsert: [next[0]], remove: ['two'] });
  });
});
