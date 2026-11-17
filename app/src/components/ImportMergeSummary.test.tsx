import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyLedger, type LedgerEntry } from '../domain/ledger';
import { resolveImportDuplicate } from '../domain/importReconciliation';
import type { ImportSummary } from '../domain/importSummary';
import { ImportMergeSummary } from './ImportMergeSummary';

const original: LedgerEntry = { id: 'approval-card', cardLast4: '1234', merchant: '메가커피', occurredAt: '2026-09-20T12:00:00+09:00', amount: 2700, status: 'classified', source: 'excel', category: 'food', bucket: 'resident' };
const pending: LedgerEntry = { id: 'bank-account', cardLast4: '6789', merchant: '네이버페이', occurredAt: original.occurredAt, amount: original.amount, status: 'undecided', source: 'bankCsv', duplicateCandidateIds: [original.id] };
const summary: ImportSummary = { added: 1, needsClassification: 0, alreadyInApp: 0 };
const row = (label: string) => screen.getByText(label).closest('li');

describe('import summary (decision 2026-11-18, 시안 C)', () => {
  it.each([true, false])('keeps the import counts and updates the live duplicate line after a %s decision', (same) => {
    const ledger = { ...createEmptyLedger(), entries: [original, pending] };
    const { rerender } = render(<ImportMergeSummary summary={summary} entries={ledger.entries} />);
    expect(row('새로 추가')).toHaveTextContent('1건');
    expect(row('중복 확인 필요')).toHaveTextContent('1건');
    const resolved = resolveImportDuplicate(ledger, pending.id, original.id, same);
    rerender(<ImportMergeSummary summary={summary} entries={resolved.entries} />);
    expect(row('새로 추가')).toHaveTextContent('1건');
    expect(screen.queryByText('중복 확인 필요')).not.toBeInTheDocument();
  });

  it('shows at most three lines and only those that apply', () => {
    const { rerender } = render(<ImportMergeSummary summary={{ added: 5, needsClassification: 3, alreadyInApp: 4 }} entries={[original]} />);
    expect(screen.getByText('가져오기 결과')).toBeInTheDocument();
    expect(row('새로 추가')).toHaveTextContent('5건 · 분류 필요 3건');
    expect(row('이미 앱에 있던 결제')).toHaveTextContent('4건');
    rerender(<ImportMergeSummary summary={{ added: 2, needsClassification: 0, alreadyInApp: 0 }} entries={[original]} />);
    expect(row('새로 추가')).toHaveTextContent('2건');
    expect(row('새로 추가')).not.toHaveTextContent('분류 필요');
    expect(screen.queryByText('이미 앱에 있던 결제')).not.toBeInTheDocument();
    rerender(<ImportMergeSummary summary={{ added: 0, needsClassification: 0, alreadyInApp: 3 }} entries={[original]} />);
    expect(screen.queryByText('새로 추가')).not.toBeInTheDocument();
    expect(row('이미 앱에 있던 결제')).toHaveTextContent('3건');
  });

  it('counts a transaction once even with multiple candidates, until the final No decision', () => {
    const other: LedgerEntry = { ...original, id: 'approval-other' };
    let ledger = { ...createEmptyLedger(), entries: [original, other, { ...pending, duplicateCandidateIds: [original.id, other.id] }] };
    const { rerender } = render(<ImportMergeSummary summary={null} entries={ledger.entries} />);
    expect(row('중복 확인 필요')).toHaveTextContent('1건');
    expect(screen.queryByText('가져오기 결과')).not.toBeInTheDocument();
    ledger = resolveImportDuplicate(ledger, pending.id, original.id, false);
    rerender(<ImportMergeSummary summary={null} entries={ledger.entries} />);
    expect(row('중복 확인 필요')).toHaveTextContent('1건');
    ledger = resolveImportDuplicate(ledger, pending.id, other.id, false);
    rerender(<ImportMergeSummary summary={null} entries={ledger.entries} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('ignores missing, self-referential and non-undecided candidates', () => {
    render(<ImportMergeSummary summary={summary} entries={[original, { ...pending, duplicateCandidateIds: ['missing', pending.id] }]} />);
    expect(screen.queryByText('중복 확인 필요')).not.toBeInTheDocument();
  });

  it('offers undo with its note only while the latest import can be undone', () => {
    const onUndo = vi.fn();
    const { rerender } = render(<ImportMergeSummary summary={summary} entries={[original]} onUndo={onUndo} />);
    fireEvent.click(screen.getByRole('button', { name: '방금 가져온 내역 되돌리기' }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.getByText('앱을 닫기 전까지만 되돌릴 수 있습니다.')).toBeInTheDocument();
    rerender(<ImportMergeSummary summary={summary} entries={[original]} />);
    expect(screen.queryByRole('button', { name: '방금 가져온 내역 되돌리기' })).not.toBeInTheDocument();
    expect(screen.queryByText('앱을 닫기 전까지만 되돌릴 수 있습니다.')).not.toBeInTheDocument();
  });

  it('does not show an empty import summary on an ordinary undecided screen', () => {
    const { container } = render(<ImportMergeSummary summary={null} entries={[original]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
