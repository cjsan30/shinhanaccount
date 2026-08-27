import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UndecidedPanel } from './UndecidedPanel';
import { POLICY_ITEMS } from '../domain/policy';

describe('undecided panel', () => {
  it('classifies selected entries in bulk and only permits a rule for one entry', () => {
    const onClassify = vi.fn();
    render(<UndecidedPanel entries={[
      { id: 'one', cardLast4: '3741', merchant: '메가커피 강남점', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' },
      { id: 'two', cardLast4: '3741', merchant: '다른 카페', amount: 4000, occurredAt: '2026-08-20T11:00:00+09:00', status: 'undecided' },
    ]} items={POLICY_ITEMS} onClassify={onClassify} />);
    fireEvent.click(screen.getByLabelText('메가커피 강남점 선택'));
    fireEvent.click(screen.getByLabelText('이 상호명도 앞으로 자동 분류'));
    fireEvent.click(screen.getByRole('button', { name: '선택한 1건 분류' }));
    expect(onClassify).toHaveBeenCalledWith(['one'], expect.objectContaining({ key: 'housing' }), true);
    fireEvent.click(screen.getByLabelText('다른 카페 선택'));
    expect(screen.getByLabelText('이 상호명도 앞으로 자동 분류')).toBeDisabled();
  });
});
