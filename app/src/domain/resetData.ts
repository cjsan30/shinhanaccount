import { createEmptyLedger } from './ledger';
import type { PersistedAppState } from '../native/encryptedStore';
export type ResetScope = 'ledger' | 'rules' | 'policy';
/** Reset only chosen app sections, never source files or device permissions. */
export function resetAppData(state: PersistedAppState, scopes: readonly ResetScope[]): PersistedAppState {
  return {
    ...state,
    ledger: scopes.includes('ledger') ? createEmptyLedger() : state.ledger,
    merchantRules: scopes.includes('rules') ? [] : state.merchantRules,
    policyBook: scopes.includes('policy') ? { versions: [] } : state.policyBook,
    reportEvidence: scopes.includes('ledger') ? state.reportEvidence?.map((record) => ({ ...record, linkedEntryId: undefined, receiptAutoLinked: undefined })) : state.reportEvidence,
  };
}
