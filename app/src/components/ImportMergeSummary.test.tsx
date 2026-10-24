import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createEmptyLedger, type LedgerEntry } from '../domain/ledger';
import { resolveImportDuplicate } from '../domain/importReconciliation';
import { ImportMergeSummary } from './ImportMergeSummary';

const original: LedgerEntry = { id: 'approval-card', cardLast4: '1234', merchant: '메가커피', occurredAt: '2026-09-20T12:00:00+09:00', amount: 2700, status: 'classified', source: 'excel', category: 'food', bucket: 'resident' };
const pending: LedgerEntry = { id: 'bank-account', cardLast4: '6789', merchant: '네이버페이', occurredAt: original.occurredAt, amount: original.amount, status: 'undecided', source: 'bankCsv', duplicateCandidateIds: [original.id] };
const summary = '신규 분류 필요 0건 · 중복 후보 1건 · 재등록 제외 0건';

describe('import summary separates historical results from remaining reviews', () => {
  it.each([true, false])('updates after a %s duplicate decision without rewriting the original import counts', (same) => {
    const ledger = { ...createEmptyLedger(), entries: [original, pending] };
    const { rerender } = render(<ImportMergeSummary summary={summary} entries={ledger.entries} />);
    expect(screen.getByText(`가져오기 당시 집계: ${summary}`)).toBeInTheDocument();
    expect(screen.getByText('현재 중복 확인 필요 1건')).toBeInTheDocument();
    const resolved = resolveImportDuplicate(ledger, pending.id, original.id, same);
    rerender(<ImportMergeSummary summary={summary} entries={resolved.entries} />);
    expect(screen.getByText(`가져오기 당시 집계: ${summary}`)).toBeInTheDocument();
    expect(screen.getByText('현재 중복 확인 필요 0건')).toBeInTheDocument();
  });

  it('counts a transaction once even with multiple candidates, until the final No decision', () => {
    const other: LedgerEntry = { ...original, id: 'approval-other' };
    let ledger = { ...createEmptyLedger(), entries: [original, other, { ...pending, duplicateCandidateIds: [original.id, other.id] }] };
    const { rerender } = render(<ImportMergeSummary summary="" entries={ledger.entries} />);
    expect(screen.getByText('현재 중복 확인 필요 1건')).toBeInTheDocument();
    ledger = resolveImportDuplicate(ledger, pending.id, original.id, false);
    rerender(<ImportMergeSummary summary="" entries={ledger.entries} />);
    expect(screen.getByText('현재 중복 확인 필요 1건')).toBeInTheDocument();
    ledger = resolveImportDuplicate(ledger, pending.id, other.id, false);
    rerender(<ImportMergeSummary summary={summary} entries={ledger.entries} />);
    expect(screen.getByText('현재 중복 확인 필요 0건')).toBeInTheDocument();
  });

  it('ignores missing, self-referential and non-undecided candidates', () => {
    render(<ImportMergeSummary summary={summary} entries={[original, { ...pending, duplicateCandidateIds: ['missing', pending.id] }]} />);
    expect(screen.getByText('현재 중복 확인 필요 0건')).toBeInTheDocument();
  });

  it('does not show an empty import summary on an ordinary undecided screen', () => {
    const { container } = render(<ImportMergeSummary summary="" entries={[original]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
