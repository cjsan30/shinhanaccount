import { describe, expect, it } from 'vitest';
import { summarizeImport } from './importSummary';

describe('import summary', () => {
  it('folds merged and skipped payments into one already-in-app count', () => {
    expect(summarizeImport({ imported: 5, mergedUndecided: 1, mergedConfirmed: 1, duplicates: 2 }))
      .toEqual({ added: 5, alreadyInApp: 4 });
  });

  it('treats missing merge counts as zero', () => {
    expect(summarizeImport({ imported: 0, duplicates: 3 })).toEqual({ added: 0, alreadyInApp: 3 });
  });
});
