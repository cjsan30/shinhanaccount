import type { ImportResult } from './ledger';

/**
 * Import result as the user reads it (decision 2026-11-18, 시안 C): new payments, of which how many
 * still need a category, and payments that were already in the app (merged or skipped).
 * Duplicates still to check are counted live from the ledger, not here.
 */
export type ImportSummary = { added: number; needsClassification: number; alreadyInApp: number };

export function summarizeImport(result: Pick<ImportResult, 'imported' | 'undecided' | 'duplicates' | 'mergedUndecided' | 'mergedConfirmed' | 'reviewNeeded'>): ImportSummary {
  return {
    added: result.imported,
    // Payments waiting for a duplicate decision are shown under 중복 확인 필요 instead.
    needsClassification: Math.max(0, result.undecided - (result.reviewNeeded ?? 0)),
    alreadyInApp: (result.mergedUndecided ?? 0) + (result.mergedConfirmed ?? 0) + result.duplicates,
  };
}
