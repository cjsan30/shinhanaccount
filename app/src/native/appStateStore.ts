import { Capacitor } from '@capacitor/core';
import { createEmptyLedger, LEDGER_STORAGE_KEY, loadLedger, saveLedger, type Ledger } from '../domain/ledger';
import { loadMerchantRules, MERCHANT_RULES_STORAGE_KEY, saveMerchantRules, type MerchantRule } from '../domain/merchantRules';
import { loadPolicyBook, POLICY_BOOK_STORAGE_KEY, POLICY_STORAGE_KEY, savePolicyBook, type PolicyBook } from '../domain/policy';
import { loadEncryptedAppState, saveEncryptedAppState, type PersistedAppState } from './encryptedStore';

export type StateStoreDependencies = {
  native: boolean;
  loadEncrypted: () => Promise<PersistedAppState | null>;
  saveEncrypted: (state: PersistedAppState) => Promise<boolean>;
};

const sensitiveLegacyKeys = [LEDGER_STORAGE_KEY, POLICY_BOOK_STORAGE_KEY, POLICY_STORAGE_KEY, MERCHANT_RULES_STORAGE_KEY] as const;

export function loadLegacyAppState(storage: Storage, now = new Date()): PersistedAppState {
  return {
    ledger: loadLedger(storage, createEmptyLedger),
    policyBook: loadPolicyBook(storage, now),
    merchantRules: loadMerchantRules(storage),
  };
}

export function saveLegacyAppState(storage: Storage, state: PersistedAppState) {
  saveLedger(storage, state.ledger);
  savePolicyBook(storage, state.policyBook);
  saveMerchantRules(storage, state.merchantRules);
}

export function clearSensitiveLegacyState(storage: Storage) {
  sensitiveLegacyKeys.forEach((key) => storage.removeItem(key));
}

export async function initializeAppState(
  storage: Storage,
  now = new Date(),
  dependencies: StateStoreDependencies = {
    native: Capacitor.isNativePlatform(),
    loadEncrypted: loadEncryptedAppState,
    saveEncrypted: saveEncryptedAppState,
  },
): Promise<{ state: PersistedAppState; migrated: boolean }> {
  const legacy = loadLegacyAppState(storage, now);
  if (!dependencies.native) return { state: legacy, migrated: false };

  const encrypted = await dependencies.loadEncrypted();
  if (encrypted) {
    clearSensitiveLegacyState(storage);
    return { state: encrypted, migrated: false };
  }

  const hadLegacyState = sensitiveLegacyKeys.some((key) => storage.getItem(key) !== null);
  const saved = await dependencies.saveEncrypted(legacy);
  if (!saved) throw new Error('암호화 저장소를 준비하지 못했습니다.');
  const verified = await dependencies.loadEncrypted();
  if (!verified) throw new Error('암호화 저장소 이전 결과를 확인하지 못했습니다.');
  clearSensitiveLegacyState(storage);
  return { state: verified, migrated: hadLegacyState };
}

export async function persistAppState(
  storage: Storage,
  state: PersistedAppState,
  dependencies: Pick<StateStoreDependencies, 'native' | 'saveEncrypted'> = {
    native: Capacitor.isNativePlatform(),
    saveEncrypted: saveEncryptedAppState,
  },
) {
  if (dependencies.native) {
    const saved = await dependencies.saveEncrypted(state);
    if (!saved) throw new Error('암호화 저장소에 저장하지 못했습니다.');
    return;
  }
  saveLegacyAppState(storage, state);
}

export function createEmptyAppState(): PersistedAppState {
  return { ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [] };
}

export type { Ledger, PolicyBook, MerchantRule };
