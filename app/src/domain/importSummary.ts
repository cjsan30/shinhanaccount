import type { ImportResult } from './ledger';

/**
 * Import result as the user reads it (decision 2026-11-18, 시안 C 1안): new payments and payments that
 * were already in the app (merged or skipped). The 분류 필요 count is already on the line below the
 * summary, and duplicates still to check are counted live from the ledger.
 */
export type ImportSummary = { added: number; alreadyInApp: number };

export function summarizeImport(result: Pick<ImportResult, 'imported' | 'duplicates' | 'mergedUndecided' | 'mergedConfirmed'>): ImportSummary {
  return {
    added: result.imported,
    alreadyInApp: (result.mergedUndecided ?? 0) + (result.mergedConfirmed ?? 0) + result.duplicates,
  };
}
