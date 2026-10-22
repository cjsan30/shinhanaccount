import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyPolicy } from '../domain/policy';
import { createEmptyLedger } from '../domain/ledger';
import { DataManagementPanel } from './DataManagementPanel';

const baseProps = () => ({
  now: new Date('2026-09-20T12:00:00+09:00'),
  importFile: null, importTransactions: null, importResult: null, importReading: false, importMessage: null, hasMaskedCardWarning: false,
  policyText: '', policyDraft: { ...emptyPolicy, plans: { ...emptyPolicy.plans, housing: 300000, food: 200000, cafe: 200000 } }, policyDraftFocusToken: 1,
  merchantRules: [], ledger: createEmptyLedger(), policyBook: { versions: [] }, periodKey: '2026-09', canUndoImport: false,
  onFileSelected: vi.fn(), onPreviewImport: vi.fn(), onApplyImport: vi.fn(), onOpenImportGuide: vi.fn(), onPolicyTextChange: vi.fn(), onReviewPolicy: vi.fn(), onReadPolicyScreenshot: vi.fn(), onUpdatePolicyDraft: vi.fn(), onUpdatePolicyProfile: vi.fn(), onUpdatePolicyAlertTarget: vi.fn(), onConfirmPolicy: vi.fn(), onOpenRules: vi.fn(), onUndoImport: vi.fn(), onResetData: vi.fn(), onRestore: vi.fn(), notify: vi.fn(),
});

describe('data management panel', () => {
  it('puts the homepage button after the support type and before balance warnings', () => {
    render(<DataManagementPanel {...baseProps()} />);
    const link = screen.getByRole('link', { name: '사업 기준·출처 확인' });
    expect(link).toHaveAttribute('href', 'https://shinchunghae.co.kr/');
    expect(screen.getByLabelText('정책 지원 유형').compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(document.querySelector('.policy-alert-targets')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('allows monthly policy dates to be reviewed and saved with a plan', () => {
    const onUpdatePolicyPeriod = vi.fn(); const onEditPolicy = vi.fn();
    render(<DataManagementPanel {...baseProps()} onUpdatePolicyPeriod={onUpdatePolicyPeriod} onEditPolicy={onEditPolicy} />);
    fireEvent.click(screen.getByRole('button', { name: '저장된 계획·기간 수정' }));
    expect(onEditPolicy).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('정책 기간 시작일')).toHaveValue('15');
    expect(screen.getByLabelText('정책 기간 종료일')).toHaveValue('10');
    fireEvent.change(screen.getByLabelText('정책 기간 시작일'), { target: { value: '1' } });
    expect(onUpdatePolicyPeriod).toHaveBeenCalledWith({ startDay: 1, endDay: 10 });
  });

  it('routes users to the unified transaction-import guide', () => {
    const props = baseProps(); render(<DataManagementPanel {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '거래내역 가져오기' }));
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
