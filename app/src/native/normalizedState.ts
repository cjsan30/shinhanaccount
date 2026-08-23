import type { PersistedAppState } from './encryptedStore';

export type StoredRow = { id: string; value: string; position: number };
export type NormalizedStateRows = {
  settings: Map<string, string>;
  ledgerEntries: StoredRow[];
  policyVersions: StoredRow[];
  merchantRules: StoredRow[];
};

const stringify = (value: unknown) => JSON.stringify(value);

export function normalizeAppState(state: PersistedAppState): NormalizedStateRows {
  return {
    settings: new Map([
      ['schema-version', '2'],
      ['state-present', '1'],
      ['alert-thresholds', stringify(state.ledger.alertThresholds)],
    ]),
    ledgerEntries: state.ledger.entries.map((entry, position) => ({ id: entry.id, value: stringify(entry), position })),
    policyVersions: state.policyBook.versions.map((version, position) => ({ id: `${version.periodKey}|${version.confirmedAt}|${position}`, value: stringify(version), position })),
    merchantRules: state.merchantRules.map((rule, position) => ({ id: rule.id, value: stringify(rule), position })),
  };
}

export function denormalizeAppState(rows: NormalizedStateRows): PersistedAppState {
  const thresholds = JSON.parse(rows.settings.get('alert-thresholds') ?? '[50,80]') as [number, number];
  const ordered = (items: StoredRow[]) => [...items].sort((left, right) => left.position - right.position);
  return {
    ledger: { entries: ordered(rows.ledgerEntries).map((row) => JSON.parse(row.value)), alertThresholds: thresholds },
    policyBook: { versions: ordered(rows.policyVersions).map((row) => JSON.parse(row.value)) },
    merchantRules: ordered(rows.merchantRules).map((row) => JSON.parse(row.value)),
  };
}

export function changedRows(previous: StoredRow[], next: StoredRow[]) {
  const before = new Map(previous.map((row) => [row.id, row]));
  const after = new Map(next.map((row) => [row.id, row]));
  return {
    upsert: next.filter((row) => {
      const old = before.get(row.id);
      return !old || old.value !== row.value || old.position !== row.position;
    }),
    remove: previous.filter((row) => !after.has(row.id)).map((row) => row.id),
  };
}
