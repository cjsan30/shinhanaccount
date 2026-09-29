import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UndecidedPanel } from './UndecidedPanel';
import { POLICY_ITEMS } from '../domain/policy';

describe('undecided panel', () => {
  it('classifies selected entries in bulk and only permits a rule for one entry', () => {
    const onClassify = vi.fn();
    const entries = [
      { id: 'one', cardLast4: '3741', merchant: '메가커피 강남점', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' },
      { id: 'two', cardLast4: '3741', merchant: '다른 카페', amount: 4000, occurredAt: '2026-08-20T11:00:00+09:00', status: 'undecided' },
    ] as const;
    const { rerender } = render(<UndecidedPanel entries={[...entries]} items={POLICY_ITEMS} onClassify={onClassify} onExclude={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('메가커피 강남점 선택'));
    fireEvent.click(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장'));
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(onClassify).toHaveBeenCalledWith(['one'], expect.objectContaining({ key: 'housing' }), true);
    rerender(<UndecidedPanel entries={[entries[1]]} items={POLICY_ITEMS} onClassify={onClassify} onExclude={vi.fn()} />);
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '바로 분류' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('다른 카페 선택'));
    expect(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장')).toBeInTheDocument();
  });

  it('selects and clears every visible entry without leaving a stale quick action', () => {
    const entries = [
      { id: 'one', cardLast4: '3741', merchant: 'alpha', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' },
      { id: 'two', cardLast4: '3741', merchant: 'bravo', amount: 4000, occurredAt: '2026-08-20T11:00:00+09:00', status: 'undecided' },
    ] as const;
    render(<UndecidedPanel entries={[...entries]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('미정 지출 전체 선택'));
    expect(screen.getAllByText('2건 선택')).toHaveLength(2);
    expect(screen.queryByLabelText('이 상호명도 자동 분류 규칙으로 저장')).not.toBeInTheDocument();
    expect(document.querySelector('.undecided-list + .undecided-quick-action')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('미정 지출 전체 선택'));
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '바로 분류' })).not.toBeInTheDocument();
  });

  it('explains why a custom item cannot be saved as a merchant rule', () => {
    const customItem = { key: 'equipment', label: '장비 대여', bucket: 'resident' as const, ledgerCategories: ['custom:equipment'] };
    const entry = { id: 'one', cardLast4: '3741', merchant: '대여점', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' } as const;
    render(<UndecidedPanel entries={[entry]} items={[customItem]} onClassify={vi.fn()} onExclude={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('대여점 선택'));
    expect(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장')).toBeDisabled();
    expect(screen.getByText('사용자 항목은 직접 분류에만 사용합니다.')).toBeInTheDocument();
  });

  it('shows an empty-state message when no undecided entries remain', () => {
    render(<UndecidedPanel entries={[]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} />);
    expect(screen.getByText('현재 기간에 미정 지출이 없습니다.')).toBeInTheDocument();
  });

  it('lets the user exclude selected business-irrelevant expenses without applying a category', () => {
    const onExclude = vi.fn();
    const entry = { id: 'one', cardLast4: '3741', merchant: '개인 결제', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' } as const;
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={onExclude} />);
    fireEvent.click(screen.getByLabelText('개인 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '사업 무관 제외' }));
    expect(onExclude).toHaveBeenCalledWith(['one']);
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
  });
});
