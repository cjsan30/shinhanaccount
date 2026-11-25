import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, NewerSchemaError, planMigrations, readSchemaVersion, type SchemaMigration } from './schemaVersion';

const step = (from: number): SchemaMigration<void> => ({ from, run: async () => undefined });

describe('schema version', () => {
  it('reads the stored version and treats a missing value as the normalized layout', () => {
    expect(readSchemaVersion(new Map([['schema-version', '2']]))).toBe(2);
    expect(readSchemaVersion(new Map())).toBe(CURRENT_SCHEMA_VERSION);
    expect(() => readSchemaVersion(new Map([['schema-version', 'abc']]))).toThrow();
    expect(() => readSchemaVersion(new Map([['schema-version', '0']]))).toThrow();
  });

  it('needs no migration when the stored version is current', () => {
    expect(planMigrations(CURRENT_SCHEMA_VERSION, [step(1)])).toEqual([]);
  });

  it('chains the migrations from the stored version up to the current one in order', () => {
    const one = step(1); const two = step(2); const three = step(3);
    expect(planMigrations(1, [three, one, two], 4)).toEqual([one, two, three]);
    expect(planMigrations(3, [three, one, two], 4)).toEqual([three]);
  });

  it('refuses data written by a newer app version', () => {
    expect(() => planMigrations(CURRENT_SCHEMA_VERSION + 1, [])).toThrow(NewerSchemaError);
  });

  it('stops when a step in the chain is missing', () => {
    expect(() => planMigrations(1, [step(1), step(3)], 4)).toThrow('2에서 3');
  });
});
