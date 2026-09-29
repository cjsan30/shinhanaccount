import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyPolicy } from '../domain/policy';
import { createEmptyLedger } from '../domain/ledger';
import { DataManagementPanel } from './DataManagementPanel';

const baseProps = () => ({
  importFile: null, importTransactions: null, importResult: null, importReading: false, importMessage: null, hasMaskedCardWarning: false,
  policyText: '', policyDraft: { ...emptyPolicy, plans: { ...emptyPolicy.plans, housing: 300000, food: 200000, cafe: 200000 } }, policyDraftFocusToken: 1,
  merchantRules: [], ledger: createEmptyLedger(), policyBook: { versions: [] }, periodKey: '2026-09', canUndoImport: false,
  onFileSelected: vi.fn(), onPreviewImport: vi.fn(), onApplyImport: vi.fn(), onOpenImportGuide: vi.fn(), onPolicyTextChange: vi.fn(), onReviewPolicy: vi.fn(), onReadPolicyScreenshot: vi.fn(), onUpdatePolicyDraft: vi.fn(), onUpdatePolicyProfile: vi.fn(), onUpdatePolicyAlertTarget: vi.fn(), onConfirmPolicy: vi.fn(), onOpenRules: vi.fn(), onUndoImport: vi.fn(), onResetData: vi.fn(), onRestore: vi.fn(), notify: vi.fn(),
});

describe('data management panel', () => {
  it('routes users to the unified transaction-import guide', () => {
    const props = baseProps(); render(<DataManagementPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '거래내역 등록 가이드' }));
    expect(props.onOpenImportGuide).toHaveBeenCalledOnce();
  });

  it('edits and applies the reviewed policy in current or next period', () => {
    const props = baseProps(); render(<DataManagementPanel {...props} />);
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: '식비 200,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    fireEvent.change(screen.getByLabelText('정책 지원 유형'), { target: { value: 'shinhanhae-40' } });
    fireEvent.change(screen.getByLabelText('주거비 계획 금액'), { target: { value: '200000' } });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: '이번 기간에 바로 반영' }));
    fireEvent.click(screen.getByRole('button', { name: '다음 적용 기간부터 예약' }));
    expect(props.onPolicyTextChange).toHaveBeenCalledWith('식비 200,000원');
    expect(props.onReviewPolicy).toHaveBeenCalledOnce();
    expect(props.onReadPolicyScreenshot).toHaveBeenCalledOnce();
    expect(props.onUpdatePolicyProfile).toHaveBeenCalledWith('shinhanhae-40');
    expect(props.onUpdatePolicyDraft).toHaveBeenCalledWith('housing', '200000');
    expect(props.onUpdatePolicyAlertTarget).toHaveBeenCalledWith('housing');
    expect(props.onConfirmPolicy).toHaveBeenNthCalledWith(1, 'current');
    expect(props.onConfirmPolicy).toHaveBeenNthCalledWith(2, 'next');
  });
});
