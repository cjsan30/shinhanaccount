import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';
import { initializeAppState, persistAppState } from './appStateStore';
import type { PersistedAppState } from './encryptedStore';

const policyBook = { versions: [{ periodKey: '2026-08', confirmedAt: '2026-08-10T00:00:00.000Z', sourceText: 'saved', plans: { housing: 1, food: 2, education: 0, transport: 3, studyCafe: 0, cafe: 4, readingRoom: 0 } }] };
const state: PersistedAppState = { ledger: { ...createEmptyLedger(), alertThresholds: [55, 85] }, policyBook, merchantRules: [] };

describe('app state persistence', () => {
  beforeEach(() => localStorage.clear());

  it('migrates legacy state only after encrypted storage can be read back', async () => {
    localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(state.ledger));
    localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify(state.policyBook));
    let encrypted: PersistedAppState | null = null;
    const result = await initializeAppState(localStorage, new Date(), {
      native: true,
      loadEncrypted: vi.fn(async () => encrypted),
      saveEncrypted: vi.fn(async (next) => { encrypted = next; return true; }),
    });
    expect(result).toEqual({ state, migrated: true });
    expect(localStorage.getItem('shinhanhae-ledger-v1')).toBeNull();
    expect(localStorage.getItem('shinhanhae-policy-book-v1')).toBeNull();
  });

  it('preserves legacy data when encrypted verification fails', async () => {
    localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(state.ledger));
    await expect(initializeAppState(localStorage, new Date(), {
      native: true,
      loadEncrypted: vi.fn(async () => null),
      saveEncrypted: vi.fn(async () => true),
    })).rejects.toThrow(/이전 결과/);
    expect(localStorage.getItem('shinhanhae-ledger-v1')).not.toBeNull();
  });

  it('prefers encrypted data and removes stale plaintext copies', async () => {
    localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    const result = await initializeAppState(localStorage, new Date(), {
      native: true,
      loadEncrypted: vi.fn(async () => state),
      saveEncrypted: vi.fn(),
    });
    expect(result.state).toBe(state);
    expect(localStorage.getItem('shinhanhae-ledger-v1')).toBeNull();
  });

  it('does not fall back to plaintext when a native encrypted write fails', async () => {
    await expect(persistAppState(localStorage, state, { native: true, saveEncrypted: vi.fn(async () => false) })).rejects.toThrow(/저장하지 못했습니다/);
    expect(localStorage.getItem('shinhanhae-ledger-v1')).toBeNull();
  });
});
