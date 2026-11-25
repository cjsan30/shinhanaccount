import { describe, expect, it, vi } from 'vitest';
import { createAppRepository } from './appRepository';
import { createEmptyAppState } from './appStateStore';
import type { PersistedAppState } from './encryptedStore';

function setup() {
  let current: PersistedAppState = createEmptyAppState();
  const saved: PersistedAppState[] = [];
  const saveEncrypted = vi.fn(async (state: PersistedAppState) => { saved.push(state); return true; });
  const repository = createAppRepository(window.localStorage, () => current, { native: true, saveEncrypted });
  return { repository, saved, saveEncrypted, setCurrent: (next: PersistedAppState) => { current = next; } };
}

describe('app repository', () => {
  it('fills the parts a save did not change from the newest in-memory state', async () => {
    const { repository, saved, setCurrent } = setup();
    const rules = [{ id: 'rule-1', pattern: '테스트 상점', bucket: 'resident', category: 'food' }] as unknown as PersistedAppState['merchantRules'];
    setCurrent({ ...createEmptyAppState(), merchantRules: rules });
    const nextBook = { versions: [], mode: 'not-applicant' as const };

    await repository.save({ policyBook: nextBook });

    expect(saved).toHaveLength(1);
    expect(saved[0].policyBook).toBe(nextBook);
    expect(saved[0].merchantRules).toBe(rules);
  });

  it('reads the in-memory state at save time, not when the repository was made', async () => {
    const { repository, saved, setCurrent } = setup();
    const later = createEmptyAppState();
    later.ledger.alertThresholds = [60, 90];
    setCurrent(later);

    await repository.save();

    expect(saved[0].ledger.alertThresholds).toEqual([60, 90]);
  });

  it('reports a failed encrypted save to the caller', async () => {
    const { repository, saveEncrypted } = setup();
    saveEncrypted.mockResolvedValueOnce(false);

    await expect(repository.save()).rejects.toThrow('암호화 저장소에 저장하지 못했습니다.');
  });
});
