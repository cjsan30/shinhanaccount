/**
 * Version of the layout the encrypted database is written in (`schema-version` in
 * app_settings). Raise it together with a migration whenever stored data changes shape.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/** One step that rewrites stored data from version `from` to version `from + 1`. */
export type SchemaMigration<Context> = { from: number; run: (context: Context) => Promise<void> };

export class NewerSchemaError extends Error {
  readonly storedVersion: number;

  constructor(storedVersion: number) {
    super(`저장된 데이터 형식(${storedVersion})이 이 앱 버전(${CURRENT_SCHEMA_VERSION})보다 새롭습니다.`);
    this.name = 'NewerSchemaError';
    this.storedVersion = storedVersion;
  }
}

/** Normalized rows have always been written with version 2, so a missing value means 2. */
export function readSchemaVersion(settings: ReadonlyMap<string, string>): number {
  const raw = settings.get('schema-version');
  if (raw === undefined) return CURRENT_SCHEMA_VERSION;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) throw new Error(`알 수 없는 저장 데이터 형식입니다: ${raw}`);
  return version;
}

/**
 * Returns the migrations that bring `storedVersion` up to `currentVersion`, in order.
 * Data written by a newer app is never opened: guessing at its shape could lose data.
 */
export function planMigrations<Context>(
  storedVersion: number,
  migrations: readonly SchemaMigration<Context>[],
  currentVersion = CURRENT_SCHEMA_VERSION,
): SchemaMigration<Context>[] {
  if (storedVersion > currentVersion) throw new NewerSchemaError(storedVersion);
  const steps: SchemaMigration<Context>[] = [];
  for (let version = storedVersion; version < currentVersion; version += 1) {
    const step = migrations.find((migration) => migration.from === version);
    if (!step) throw new Error(`저장 데이터 형식 ${version}에서 ${version + 1}(으)로 옮기는 방법이 없습니다.`);
    steps.push(step);
  }
  return steps;
}
