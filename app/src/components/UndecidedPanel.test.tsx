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
    const { rerender } = render(<UndecidedPanel entries={[...entries]} items={POLICY_ITEMS} onClassify={onClassify} />);
    fireEvent.click(screen.getByLabelText('메가커피 강남점 선택'));
    fireEvent.click(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장'));
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(onClassify).toHaveBeenCalledWith(['one'], expect.objectContaining({ key: 'housing' }), true);
    rerender(<UndecidedPanel entries={[entries[1]]} items={POLICY_ITEMS} onClassify={onClassify} />);
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '바로 분류' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('다른 카페 선택'));
    expect(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장')).toBeInTheDocument();
  });
});
