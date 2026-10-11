import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';

const mocks = vi.hoisted(() => ({ isNativePlatform: vi.fn(), isSecretStored: vi.fn(), setEncryptionSecret: vi.fn(), createConnection: vi.fn() }));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: mocks.isNativePlatform } }));
vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: { isSecretStored: mocks.isSecretStored, setEncryptionSecret: mocks.setEncryptionSecret },
  SQLiteConnection: class { createConnection(...args: unknown[]) { return mocks.createConnection(...args); } },
}));

function memoryDatabase() {
  const tables = new Map<string, Map<string, { id: string; value: string; position: number }>>([
    ['ledger_entries', new Map()], ['policy_versions', new Map()], ['merchant_rules', new Map()], ['app_state', new Map()],
  ]);
  const settings = new Map<string, string>();
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes('FROM app_settings')) return { values: [...settings].map(([key, value]) => ({ key, value })) };
    if (sql.includes('FROM app_state')) { const row = tables.get('app_state')!.get(String(params[0])); return { values: row ? [{ value: row.value }] : [] }; }
    const table = /FROM (ledger_entries|policy_versions|merchant_rules)/.exec(sql)?.[1];
    return { values: table ? [...tables.get(table)!.values()].sort((left, right) => left.position - right.position) : [] };
  });
  const run = vi.fn(async (sql: string, params: unknown[] = []) => {
    const settingInsert = /INSERT OR REPLACE INTO app_settings/.test(sql);
    if (settingInsert) { settings.set(String(params[0]), String(params[1])); return {}; }
    if (/DELETE FROM app_settings WHERE key/.test(sql)) { settings.delete(String(params[0])); return {}; }
    const table = /(ledger_entries|policy_versions|merchant_rules|app_state)/.exec(sql)?.[1];
    if (!table) return {};
    const target = tables.get(table)!;
    if (sql.startsWith('DELETE FROM')) { if (sql.includes('WHERE id') || sql.includes('WHERE key')) target.delete(String(params[0])); else target.clear(); return {}; }
    if (sql.includes('INSERT')) target.set(String(params[0]), { id: String(params[0]), value: String(params[1]), position: Number(params[2]) });
    return {};
  });
  return { open: vi.fn(async () => undefined), execute: vi.fn(async () => undefined), query, run, beginTransaction: vi.fn(async () => undefined), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined), tables, settings };
}

describe('encrypted app state', () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); mocks.isNativePlatform.mockReturnValue(true); mocks.isSecretStored.mockResolvedValue({ result: false }); mocks.setEncryptionSecret.mockResolvedValue(undefined); });

  it('creates an encrypted native database, persists normalized rows, and reloads them', async () => {
    const db = memoryDatabase(); mocks.createConnection.mockResolvedValue(db);
    const { saveEncryptedAppState, loadEncryptedAppState } = await import('./encryptedStore');
    const state = { ledger: { ...createEmptyLedger(), entries: [{ id: 'payment-1', cardLast4: '3741', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '카페', amount: 5000, status: 'classified' as const, bucket: 'resident' as const, category: 'food' }] }, policyBook: { versions: [] }, merchantRules: [], reportEvidence: [] };
    await expect(saveEncryptedAppState(state)).resolves.toBe(true);
    expect(mocks.setEncryptionSecret).toHaveBeenCalledOnce();
    expect(db.settings.get('state-present')).toBe('1');
    expect(db.tables.get('ledger_entries')!.size).toBe(1);
    await expect(loadEncryptedAppState()).resolves.toEqual(state);
  });

  it('updates only changed normalized rows and retains atomic transaction boundaries', async () => {
    const db = memoryDatabase(); mocks.createConnection.mockResolvedValue(db);
    const { saveEncryptedAppState } = await import('./encryptedStore');
    const initial = { ledger: { ...createEmptyLedger(), entries: [{ id: 'payment-1', cardLast4: '3741', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '카페', amount: 5000, status: 'undecided' as const }] }, policyBook: { versions: [] }, merchantRules: [] };
    await saveEncryptedAppState(initial);
    const before = db.run.mock.calls.length;
    await saveEncryptedAppState({ ...initial, ledger: { ...initial.ledger, entries: [{ ...initial.ledger.entries[0], merchant: '수정 카페' }] } });
    const secondWrites = db.run.mock.calls.slice(before).filter(([sql]) => String(sql).includes('ledger_entries'));
    expect(secondWrites).toHaveLength(1);
    expect(db.beginTransaction).toHaveBeenCalledTimes(2);
    expect(db.commitTransaction).toHaveBeenCalledTimes(2);
  });

  it('removes obsolete non-applicant mode when a current-period plan is confirmed', async () => {
    const db = memoryDatabase(); mocks.createConnection.mockResolvedValue(db);
    const { saveEncryptedAppState, loadEncryptedAppState } = await import('./encryptedStore');
    const base = { ledger: createEmptyLedger(), merchantRules: [], reportEvidence: [] };
    await saveEncryptedAppState({ ...base, policyBook: { versions: [], mode: 'not-applicant' } });
    await saveEncryptedAppState({ ...base, policyBook: { versions: [{ periodKey: '2026-10', confirmedAt: '2026-10-04T00:00:00.000Z', sourceText: '', plans: { housing: 500000, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 200000, readingRoom: 0 } }] } });

    expect(db.settings.has('policy-mode')).toBe(false);
    await expect(loadEncryptedAppState()).resolves.toMatchObject({ policyBook: { versions: [{ periodKey: '2026-10' }] } });
  });

  it('does not create a database or fall back to plaintext outside native platforms', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const { loadEncryptedAppState, saveEncryptedAppState } = await import('./encryptedStore');
    const state = { ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [] };
    await expect(loadEncryptedAppState()).resolves.toBeNull();
    await expect(saveEncryptedAppState(state)).resolves.toBe(false);
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });

  it('rolls back a failed write and lets the queued next write recover', async () => {
    const db = memoryDatabase(); mocks.createConnection.mockResolvedValue(db);
    const originalRun = db.run.getMockImplementation()!;
    let failLedgerInsert = true;
    db.run.mockImplementation(async (sql: string, params: unknown[] = []) => {
      if (failLedgerInsert && sql.includes('INSERT INTO ledger_entries')) { failLedgerInsert = false; throw new Error('simulated storage failure'); }
      return originalRun(sql, params);
    });
    const { saveEncryptedAppState } = await import('./encryptedStore');
    const state = { ledger: { ...createEmptyLedger(), entries: [{ id: 'payment-1', cardLast4: '3741', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '카페', amount: 5000, status: 'undecided' as const }] }, policyBook: { versions: [] }, merchantRules: [] };

    await expect(saveEncryptedAppState(state)).rejects.toThrow('simulated storage failure');
    expect(db.rollbackTransaction).toHaveBeenCalledOnce();
    await expect(saveEncryptedAppState(state)).resolves.toBe(true);
    expect(db.commitTransaction).toHaveBeenCalledOnce();
  });

  it('migrates a legacy encrypted snapshot once and removes the legacy row', async () => {
    const db = memoryDatabase(); mocks.createConnection.mockResolvedValue(db); mocks.isSecretStored.mockResolvedValue({ result: true });
    const state = { ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [], reportEvidence: [] };
    db.tables.get('app_state')!.set('app-state-v1', { id: 'app-state-v1', value: JSON.stringify(state), position: 0 });
    const { loadEncryptedAppState } = await import('./encryptedStore');

    await expect(loadEncryptedAppState()).resolves.toEqual(state);
    expect(db.tables.get('app_state')!.has('app-state-v1')).toBe(false);
    expect(mocks.setEncryptionSecret).not.toHaveBeenCalled();
  });
});
