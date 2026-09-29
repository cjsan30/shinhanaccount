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
    const table = /(ledger_entries|policy_versions|merchant_rules|app_state)/.exec(sql)?.[1];
    if (!table) return {};
    const target = tables.get(table)!;
    if (sql.startsWith('DELETE FROM')) { if (sql.includes('WHERE id')) target.delete(String(params[0])); else target.clear(); return {}; }
    if (sql.includes('INSERT')) target.set(String(params[0]), { id: String(params[0]), value: String(params[1]), position: Number(params[2]) });
    return {};
  });
  return { open: vi.fn(), execute: vi.fn(), query, run, beginTransaction: vi.fn(), commitTransaction: vi.fn(), rollbackTransaction: vi.fn(), tables, settings };
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

  it('does not create a database or fall back to plaintext outside native platforms', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const { loadEncryptedAppState, saveEncryptedAppState } = await import('./encryptedStore');
    const state = { ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [] };
    await expect(loadEncryptedAppState()).resolves.toBeNull();
    await expect(saveEncryptedAppState(state)).resolves.toBe(false);
    expect(mocks.createConnection).not.toHaveBeenCalled();
  });
});
