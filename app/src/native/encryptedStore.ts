import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Ledger } from '../domain/ledger';
import type { PolicyBook } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';
import { changedRows, denormalizeAppState, normalizeAppState, type NormalizedStateRows, type StoredRow } from './normalizedState';

export type PersistedAppState = { ledger: Ledger; policyBook: PolicyBook; merchantRules: MerchantRule[] };
const DATABASE = 'shinhanhae';
const LEGACY_STATE_KEY = 'app-state-v1';
let connection: Awaited<ReturnType<SQLiteConnection['createConnection']>> | null = null;
let writeQueue: Promise<unknown> = Promise.resolve();
let cachedRows: NormalizedStateRows | null = null;

async function database() {
  if (!Capacitor.isNativePlatform()) return null;
  if (connection) return connection;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const secret = await CapacitorSQLite.isSecretStored();
  if (!secret.result) await CapacitorSQLite.setEncryptionSecret({ passphrase: `${crypto.randomUUID()}-${crypto.randomUUID()}` });
  // Keep the plugin connection version at 1 so existing encrypted databases
  // open without requiring Capacitor SQLite upgrade statements. The app-level
  // schema version is tracked independently in app_settings.
  connection = await sqlite.createConnection(DATABASE, true, 'secret', 1, false);
  await connection.open();
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS ledger_entries (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS policy_versions (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS merchant_rules (id TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, position INTEGER NOT NULL);
  `);
  return connection;
}

type DatabaseConnection = NonNullable<Awaited<ReturnType<typeof database>>>;

async function queryRows(db: DatabaseConnection, table: string): Promise<StoredRow[]> {
  const result = await db.query(`SELECT id, value, position FROM ${table} ORDER BY position ASC;`);
  return (result.values ?? []).map((row) => ({ id: String(row.id), value: String(row.value), position: Number(row.position) }));
}

async function readNormalizedRows(db: DatabaseConnection): Promise<NormalizedStateRows | null> {
  const settingsResult = await db.query('SELECT key, value FROM app_settings;');
  const settings = new Map<string, string>((settingsResult.values ?? []).map((row): [string, string] => [String(row.key), String(row.value)]));
  if (settings.get('state-present') !== '1') return null;
  return {
    settings,
    ledgerEntries: await queryRows(db, 'ledger_entries'),
    policyVersions: await queryRows(db, 'policy_versions'),
    merchantRules: await queryRows(db, 'merchant_rules'),
  };
}

async function replaceRows(db: DatabaseConnection, table: string, rows: StoredRow[]) {
  await db.run(`DELETE FROM ${table};`);
  for (const row of rows) await db.run(`INSERT INTO ${table} (id, value, position) VALUES (?, ?, ?);`, [row.id, row.value, row.position]);
}

async function updateRows(db: DatabaseConnection, table: string, previous: StoredRow[], next: StoredRow[]) {
  const changes = changedRows(previous, next);
  for (const id of changes.remove) await db.run(`DELETE FROM ${table} WHERE id = ?;`, [id]);
  for (const row of changes.upsert) await db.run(`INSERT OR REPLACE INTO ${table} (id, value, position) VALUES (?, ?, ?);`, [row.id, row.value, row.position]);
}

async function writeRows(db: DatabaseConnection, next: NormalizedStateRows, previous: NormalizedStateRows | null) {
  await db.beginTransaction();
  try {
    for (const [key, value] of next.settings) await db.run('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?);', [key, value]);
    if (previous) {
      await updateRows(db, 'ledger_entries', previous.ledgerEntries, next.ledgerEntries);
      await updateRows(db, 'policy_versions', previous.policyVersions, next.policyVersions);
      await updateRows(db, 'merchant_rules', previous.merchantRules, next.merchantRules);
    } else {
      await replaceRows(db, 'ledger_entries', next.ledgerEntries);
      await replaceRows(db, 'policy_versions', next.policyVersions);
      await replaceRows(db, 'merchant_rules', next.merchantRules);
    }
    await db.commitTransaction();
  } catch (error) {
    await db.rollbackTransaction().catch(() => undefined);
    throw error;
  }
}

async function migrateLegacySnapshot(db: DatabaseConnection) {
  const result = await db.query('SELECT value FROM app_state WHERE key = ?;', [LEGACY_STATE_KEY]);
  const value = result.values?.[0]?.value;
  if (typeof value !== 'string') return null;
  const state = JSON.parse(value) as PersistedAppState;
  const rows = normalizeAppState(state);
  await writeRows(db, rows, null);
  await db.run('DELETE FROM app_state WHERE key = ?;', [LEGACY_STATE_KEY]);
  return rows;
}

export async function loadEncryptedAppState(): Promise<PersistedAppState | null> {
  await writeQueue.catch(() => undefined);
  const db = await database(); if (!db) return null;
  cachedRows = await readNormalizedRows(db) ?? await migrateLegacySnapshot(db);
  return cachedRows ? denormalizeAppState(cachedRows) : null;
}

export async function saveEncryptedAppState(state: PersistedAppState) {
  const rows = normalizeAppState(state);
  const write = writeQueue.catch(() => undefined).then(async () => {
    const db = await database(); if (!db) return false;
    const previous = cachedRows ?? await readNormalizedRows(db);
    await writeRows(db, rows, previous);
    cachedRows = rows;
    return true;
  });
  writeQueue = write;
  return write;
}
