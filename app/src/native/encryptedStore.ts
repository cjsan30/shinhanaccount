import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import type { Ledger } from '../domain/ledger';
import type { PolicyBook } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';

export type PersistedAppState = { ledger: Ledger; policyBook: PolicyBook; merchantRules: MerchantRule[] };
const DATABASE = 'shinhanhae';
const STATE_KEY = 'app-state-v1';
let connection: Awaited<ReturnType<SQLiteConnection['createConnection']>> | null = null;

async function database() {
  if (!Capacitor.isNativePlatform()) return null;
  if (connection) return connection;
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const secret = await CapacitorSQLite.isSecretStored();
  if (!secret.result) await CapacitorSQLite.setEncryptionSecret({ passphrase: `${crypto.randomUUID()}-${crypto.randomUUID()}` });
  connection = await sqlite.createConnection(DATABASE, true, 'secret', 1, false);
  await connection.open();
  await connection.execute('CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  return connection;
}

export async function loadEncryptedAppState(): Promise<PersistedAppState | null> {
  const db = await database(); if (!db) return null;
  const result = await db.query('SELECT value FROM app_state WHERE key = ?;', [STATE_KEY]);
  const value = result.values?.[0]?.value;
  return typeof value === 'string' ? JSON.parse(value) as PersistedAppState : null;
}

export async function saveEncryptedAppState(state: PersistedAppState) {
  const db = await database(); if (!db) return false;
  await db.run('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?);', [STATE_KEY, JSON.stringify(state)]);
  return true;
}