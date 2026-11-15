import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';
import { DataManagementPanel } from './DataManagementPanel';

const baseProps = () => ({
  importFile: null, importTransactions: null, importResult: null, importReading: false, importMessage: null, hasMaskedCardWarning: false,
  merchantRules: [], ledger: createEmptyLedger(), policyBook: { versions: [] }, periodKey: '2026-09', canUndoImport: false,
  onFileSelected: vi.fn(), onPreviewImport: vi.fn(), onApplyImport: vi.fn(), onOpenImportGuide: vi.fn(), onOpenRules: vi.fn(), onUndoImport: vi.fn(), onResetData: vi.fn(), onRestore: vi.fn(), notify: vi.fn(),
});

describe('data management panel', () => {
  it('shows no links to outside sites in data management', () => {
    render(<DataManagementPanel {...baseProps()} />);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });
  it('no longer edits the plan here; the plan opens from the dashboard', () => {
    render(<DataManagementPanel {...baseProps()} />);
    expect(screen.queryByText('계획표')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('계획표 내용')).not.toBeInTheDocument();
  });

  it('routes users to the unified transaction-import guide', () => {
    const props = baseProps(); render(<DataManagementPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '거래내역 가져오기' }));
    expect(props.onOpenImportGuide).toHaveBeenCalledOnce();
  });
});
