import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Ledger, LedgerEntry } from '../../domain/ledger';
import { CancellationReview, PaymentCancel, PaymentDelete, PaymentDetail, PaymentEdit } from './PaymentPanels';

const entry = (patch: Partial<LedgerEntry> = {}): LedgerEntry => ({ id: 'p1', cardLast4: '0000', occurredAt: '2026-09-20T12:00:00+09:00', amount: 12000, merchant: '테스트 식당', status: 'classified', bucket: 'resident', category: 'food', ...patch });
const detailProps = (patch: Partial<Parameters<typeof PaymentDetail>[0]> = {}) => ({
  entry: entry(), merchantAlias: undefined, categoryNames: { food: '식비' }, inActivePeriod: true, hasSuspectedDuplicate: false,
  onEdit: vi.fn(), onMarkUndecided: vi.fn(), onCancel: vi.fn(), onDelete: vi.fn(), ...patch,
});

describe('payment detail', () => {
  it('shows the alias with the original merchant and the classification', () => {
    render(<PaymentDetail {...detailProps({ merchantAlias: '점심' })} />);
    expect(screen.getByText('점심')).toBeInTheDocument();
    expect(screen.getByText('원본 결제처 · 테스트 식당')).toBeInTheDocument();
    expect(screen.getByText('정주비 · 식비')).toBeInTheDocument();
    expect(screen.queryByText(/현재 적용 기간 외 결제/)).not.toBeInTheDocument();
  });

  it('offers all four actions for a classified payment and passes the entry back', () => {
    const props = detailProps();
    render(<PaymentDetail {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '수정 · 분류 변경' }));
    fireEvent.click(screen.getByRole('button', { name: '미정으로 되돌리기' }));
    fireEvent.click(screen.getByRole('button', { name: '취소 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    for (const handler of [props.onEdit, props.onMarkUndecided, props.onCancel, props.onDelete]) expect(handler).toHaveBeenCalledWith(props.entry);
  });

  it('offers only restore and delete for an excluded payment', () => {
    render(<PaymentDetail {...detailProps({ entry: entry({ status: 'excluded' }) })} />);
    expect(screen.getByText('사업 무관 제외')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['미정으로 되돌리기', '삭제']);
  });

  it('notes out-of-period, duplicate and partial-cancellation states', () => {
    render(<PaymentDetail {...detailProps({ entry: entry({ cancelledAmount: 2000, supportAmountReviewRequired: true }), inActivePeriod: false, hasSuspectedDuplicate: true })} />);
    expect(screen.getByText(/현재 적용 기간 외 결제/)).toBeInTheDocument();
    expect(screen.getByText(/유사 결제가 있습니다/)).toBeInTheDocument();
    expect(screen.getByText('취소 2,000원 · 남은 결제 10,000원')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('금액 재확인 필요');
  });

  it('reports a missing payment', () => {
    render(<PaymentDetail {...detailProps({ entry: null })} />);
    expect(screen.getByText('결제 내역을 찾지 못했습니다.')).toBeInTheDocument();
  });
});

describe('payment edit', () => {
  it('saves with the bucket and ledger category of the selected item', () => {
    const onSave = vi.fn();
    render(<PaymentEdit entry={entry({ category: 'transport' })} onSave={onSave} />);
    expect(screen.getByLabelText('수정 분류')).toHaveValue('transport');
    fireEvent.change(screen.getByLabelText('수정 분류'), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: '수정 저장' }));
    expect(onSave).toHaveBeenCalledWith('studySpace', 'generalCafe');
  });
});

describe('payment delete', () => {
  it('confirms deletion of the shown payment', () => {
    const onConfirm = vi.fn();
    render(<PaymentDelete entry={entry()} onConfirm={onConfirm} />);
    expect(screen.getByText('2026-09-20 · 12,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '결제 내역 삭제' }));
    expect(onConfirm).toHaveBeenCalled();
  });
});

describe('payment cancel', () => {
  it('labels a full cancellation only when the amount equals the remaining payment', () => {
    const { rerender } = render(<PaymentCancel entry={entry({ cancelledAmount: 2000 })} amount="10000" onAmountChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: '전체 취소 확정' })).toBeInTheDocument();
    rerender(<PaymentCancel entry={entry({ cancelledAmount: 2000 })} amount="3000" onAmountChange={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('button', { name: '부분 취소 확정' })).toBeInTheDocument();
    expect(screen.getByLabelText('취소 금액')).toHaveAttribute('max', '10000');
  });
});

describe('cancellation review', () => {
  const ledger: Ledger = { entries: [entry()], alertThresholds: [50, 80] };
  const notice = { id: 'c1', cardLast4: '0000', occurredAt: '2026-09-21T09:00:00+09:00', amount: 12000, merchant: '테스트 식당' };

  it('lets the user pick the cancelled payment among the candidates', () => {
    const onConfirm = vi.fn();
    render(<CancellationReview ledger={ledger} notices={[notice]} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: /전체 취소/ }));
    expect(onConfirm).toHaveBeenCalledWith(notice, ledger.entries[0]);
  });

  it('explains when no payment matches and when nothing is pending', () => {
    const { rerender } = render(<CancellationReview ledger={{ ...ledger, entries: [] }} notices={[notice]} onConfirm={vi.fn()} />);
    expect(screen.getByText(/일치하는 결제가 없습니다/)).toBeInTheDocument();
    rerender(<CancellationReview ledger={ledger} notices={[]} onConfirm={vi.fn()} />);
    expect(screen.getByText('확인할 취소 알림이 없습니다.')).toBeInTheDocument();
  });
});
