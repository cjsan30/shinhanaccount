import { persistAppState } from './appStateStore';
import type { PersistedAppState } from './encryptedStore';

type PersistDependencies = Parameters<typeof persistAppState>[2];

/**
 * The single place the app writes its stored state. Callers pass only the parts they
 * changed; the rest comes from the latest in-memory snapshot, so a save started by one
 * screen never writes back an older copy of data another path changed meanwhile.
 */
export function createAppRepository(
  storage: Storage,
  current: () => PersistedAppState,
  dependencies?: PersistDependencies,
) {
  return {
    save(changes: Partial<PersistedAppState> = {}) {
      return persistAppState(storage, { ...current(), ...changes }, dependencies);
    },
  };
}

export type AppRepository = ReturnType<typeof createAppRepository>;
