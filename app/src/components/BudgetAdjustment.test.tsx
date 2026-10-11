import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BudgetAdjustment } from './BudgetAdjustment';
import { emptyPolicy } from '../domain/policy';

const policy = { ...emptyPolicy, plans: { ...emptyPolicy.plans, food: 200000, education: 200000, transport: 100000, cafe: 200000 } };
function fill(amount = '50000') {
  fireEvent.change(screen.getByLabelText('예산 가져올 항목'), { target: { value: 'transport' } });
  fireEvent.change(screen.getByLabelText('예산 받을 항목'), { target: { value: 'housing' } });
  fireEvent.change(screen.getByLabelText('예산 이동 금액'), { target: { value: amount } });
}
describe('budget adjustment UI', () => {
  it('shows a zero-plan destination, previews final plans and applies once', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    render(<BudgetAdjustment policy={policy} spent={{ transport: 20000 }} onApply={onApply} />);
    expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeDisabled();
    fill();
    expect(screen.getByText('0원 → 50,000원')).toBeInTheDocument();
    expect(screen.getByText('100,000원 → 50,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '예산 조정 적용' }));
    await screen.findByText(/예산을 조정했습니다/);
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ from: 'transport', to: 'housing', amount: 50000 });
    expect(screen.getByLabelText('예산 이동 금액')).toHaveValue('');
  });
  it('offers only same-bucket destinations and clears values on changing bucket', () => {
    render(<BudgetAdjustment policy={policy} spent={{}} onApply={vi.fn()} />);
    fill();
    expect(screen.getByLabelText('예산 받을 항목')).not.toHaveTextContent('카페');
    fireEvent.change(screen.getByLabelText('예산 조정 대분류'), { target: { value: 'studySpace' } });
    expect(screen.getByLabelText('예산 받을 항목')).not.toHaveTextContent('주거비');
    expect(screen.getByLabelText('예산 받을 항목')).toHaveTextContent('독서실');
    expect(screen.getByLabelText('예산 가져올 항목')).toHaveValue('');
    expect(screen.getByLabelText('예산 이동 금액')).toHaveValue('');
  });
  it.each(['80001', '-1', '5e4', '50.5', 'NaN'])('rejects an invalid/excess amount %s', (amount) => {
    const onApply = vi.fn(); render(<BudgetAdjustment policy={policy} spent={{ transport: 20000 }} onApply={onApply} />);
    fill(amount);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });
  it('locks the form until the encrypted save completes and prevents repeated submission', async () => {
    let finish!: () => void; const onApply = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<BudgetAdjustment policy={policy} spent={{}} bucket="resident" onApply={onApply} />);
    expect(screen.queryByLabelText('예산 조정 대분류')).not.toBeInTheDocument();
    fill(); const button = screen.getByRole('button', { name: '예산 조정 적용' });
    fireEvent.click(button); fireEvent.click(button);
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
    expect(screen.getByLabelText('예산 받을 항목')).toBeDisabled();
    await act(async () => finish());
    expect(onApply).toHaveBeenCalledOnce();
  });
  it('does not claim success or clear the input when saving fails, and allows retry', async () => {
    const onApply = vi.fn().mockRejectedValueOnce(new Error('저장 실패')).mockResolvedValue(undefined);
    render(<BudgetAdjustment policy={policy} spent={{}} onApply={onApply} />); fill();
    fireEvent.click(screen.getByRole('button', { name: '예산 조정 적용' }));
    await screen.findByText('저장 실패');
    expect(screen.getByLabelText('예산 이동 금액')).toHaveValue('50000');
    expect(screen.queryByText(/예산을 조정했습니다/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '예산 조정 적용' }));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
  });
  it('invalidates a pending preview if spending increases while the form is open', () => {
    const onApply = vi.fn(); const view = render(<BudgetAdjustment policy={policy} spent={{ transport: 20000 }} onApply={onApply} />);
    fill(); expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeEnabled();
    view.rerender(<BudgetAdjustment policy={policy} spent={{ transport: 60000 }} onApply={onApply} />);
    expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('미사용 예산');
    expect(screen.queryByLabelText('조정 후 계획')).not.toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });
  it('clears a destination when it becomes the new source', () => {
    render(<BudgetAdjustment policy={policy} spent={{}} onApply={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('예산 가져올 항목'), { target: { value: 'transport' } });
    fireEvent.change(screen.getByLabelText('예산 받을 항목'), { target: { value: 'education' } });
    fireEvent.change(screen.getByLabelText('예산 가져올 항목'), { target: { value: 'education' } });
    expect(screen.getByLabelText('예산 받을 항목')).toHaveValue('');
  });
  it('disables a stale custom-category preview after the category is removed', () => {
    const custom = { ...policy, customItems: [{ id: 'custom', label: '기타', bucket: 'resident' as const, amount: 1000 }] };
    const view = render(<BudgetAdjustment policy={custom} spent={{}} onApply={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('예산 가져올 항목'), { target: { value: 'custom' } });
    view.rerender(<BudgetAdjustment policy={policy} spent={{}} onApply={vi.fn()} />);
    expect(screen.getByText('가져올 수 있는 금액: 0원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeDisabled();
  });
  it('uses a clean retry message for a non-Error save rejection', async () => {
    render(<BudgetAdjustment policy={policy} spent={{}} onApply={vi.fn().mockRejectedValue(null)} />); fill();
    fireEvent.click(screen.getByRole('button', { name: '예산 조정 적용' }));
    await screen.findByText('저장하지 못했습니다. 다시 시도해 주세요.');
  });
});
