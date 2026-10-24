import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UndecidedPanel } from './UndecidedPanel';
import { POLICY_ITEMS } from '../domain/policy';

describe('undecided panel', () => {
  it('asks Yes or No before allowing classification of a suspected duplicate', () => {
    const resolve = vi.fn();
    const existing = { id: 'card', source: 'excel' as const, cardLast4: '1234', merchant: '메가커피', amount: 2700, occurredAt: '2026-09-20T12:00:00+09:00', status: 'classified' as const, category: 'food' };
    const incoming = { ...existing, id: 'bank', merchant: '네이버페이', status: 'undecided' as const, duplicateCandidateIds: ['card'] };
    render(<UndecidedPanel entries={[incoming]} allEntries={[existing, incoming]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} onResolveDuplicate={resolve} />);
    expect(screen.getByLabelText('네이버페이 선택')).toBeDisabled();
    expect(screen.getByText('같은 거래인가요?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' })); expect(resolve).toHaveBeenCalledWith('bank', 'card', true);
    fireEvent.click(screen.getByRole('button', { name: 'No' })); expect(resolve).toHaveBeenCalledWith('bank', 'card', false);
  });
  it('classifies selected entries in bulk and only permits a rule for one entry', () => {
    const onClassify = vi.fn();
    const entries = [
      { id: 'one', cardLast4: '4321', merchant: '메가커피 강남점', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' },
      { id: 'two', cardLast4: '4321', merchant: '다른 카페', amount: 4000, occurredAt: '2026-08-20T11:00:00+09:00', status: 'undecided' },
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
      { id: 'one', cardLast4: '4321', merchant: 'alpha', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' },
      { id: 'two', cardLast4: '4321', merchant: 'bravo', amount: 4000, occurredAt: '2026-08-20T11:00:00+09:00', status: 'undecided' },
    ] as const;
    render(<UndecidedPanel entries={[...entries]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('분류 필요 결제 전체 선택'));
    expect(screen.getAllByText('2건 선택')).toHaveLength(2);
    expect(screen.queryByLabelText('이 상호명도 자동 분류 규칙으로 저장')).not.toBeInTheDocument();
    expect(document.querySelector('.undecided-list + .undecided-quick-action')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('분류 필요 결제 전체 선택'));
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '바로 분류' })).not.toBeInTheDocument();
  });

  it('explains why a custom item cannot be saved as a merchant rule', () => {
    const customItem = { key: 'equipment', label: '장비 대여', bucket: 'resident' as const, ledgerCategories: ['custom:equipment'] };
    const entry = { id: 'one', cardLast4: '4321', merchant: '대여점', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' } as const;
    render(<UndecidedPanel entries={[entry]} items={[customItem]} onClassify={vi.fn()} onExclude={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('대여점 선택'));
    expect(screen.getByLabelText('이 상호명도 자동 분류 규칙으로 저장')).toBeDisabled();
    expect(screen.getByText('사용자 항목은 직접 분류에만 사용합니다.')).toBeInTheDocument();
  });

  it('shows an empty-state message when no undecided entries remain', () => {
    render(<UndecidedPanel entries={[]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} />);
    expect(screen.getByText('현재 기간에 분류할 결제가 없습니다.')).toBeInTheDocument();
  });

  it('lets the user exclude selected business-irrelevant expenses without applying a category', () => {
    const onExclude = vi.fn();
    const entry = { id: 'one', cardLast4: '4321', merchant: '개인 결제', amount: 5000, occurredAt: '2026-08-20T10:00:00+09:00', status: 'undecided' } as const;
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={onExclude} />);
    fireEvent.click(screen.getByLabelText('개인 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '사업 무관 제외' }));
    expect(onExclude).toHaveBeenCalledWith(['one']);
    expect(screen.getByText('0건 선택')).toBeInTheDocument();
  });
});

describe('subsidy amount controls', () => {
  const entry = { id: 'portion', merchant: '지원금 일부 결제', amount: 50000, cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', status: 'undecided' as const };
  it('opens and folds the amount editor with Enter and Space without selecting the expense', async () => {
    const user = userEvent.setup();
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} onSupportAmountChange={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액')).toBeInTheDocument();
    expect(screen.getByLabelText('지원금 일부 결제 선택')).not.toBeChecked();
    await user.keyboard(' ');
    expect(screen.queryByLabelText('지원금 일부 결제 지원금 반영 금액')).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });
  it('keeps the amount non-interactive when editing is unavailable', () => {
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} />);
    expect(screen.getByText('50,000원').tagName).toBe('B');
    expect(screen.queryByRole('button', { name: /지원금 반영 금액 수정/ })).not.toBeInTheDocument();
  });
  it('preserves selection when exclusion is cancelled', () => {
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={() => false} />);
    fireEvent.click(screen.getByLabelText('지원금 일부 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '사업 무관 제외' }));
    expect(screen.getByLabelText('지원금 일부 결제 선택')).toBeChecked();
    expect(screen.getByRole('button', { name: '바로 분류' })).toBeInTheDocument();
  });
  it('commits a valid portion before classification and rejects out-of-range drafts', () => {
    const amount = vi.fn(); const classify = vi.fn();
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={classify} onExclude={vi.fn()} onSupportAmountChange={amount} />);
    fireEvent.click(screen.getByLabelText('지원금 일부 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' }));
    fireEvent.change(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액'), { target: { value: '50001' } });
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(classify).not.toHaveBeenCalled(); expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액'), { target: { value: '30000' } });
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(amount).toHaveBeenCalledWith('portion', 30000); expect(classify).toHaveBeenCalledOnce();
    expect(amount.mock.invocationCallOrder[0]).toBeLessThan(classify.mock.invocationCallOrder[0]);
  });
  it('keeps ordinary expenses collapsed and classifies without any amount edit', () => {
    const amount = vi.fn(); const classify = vi.fn();
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={classify} onExclude={vi.fn()} onSupportAmountChange={amount} />);
    const toggle = screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle.closest('article')).toHaveClass('reclassify-card');
    expect(toggle.closest('.reclassify-card__meta')).not.toBeNull();
    expect(toggle).toHaveTextContent('50,000원');
    expect(toggle.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(document.querySelector('.support-amount-controls')).toBeNull();
    expect(screen.queryByLabelText('지원금 일부 결제 지원금 반영 금액')).not.toBeInTheDocument();
    expect(screen.getByText('50,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('지원금 일부 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(amount).not.toHaveBeenCalled();
    expect(classify).toHaveBeenCalledWith(['portion'], expect.objectContaining({ key: 'housing' }), false);
  });
  it('expands only the requested card, removes the helper copy, and preserves the draft when folded', () => {
    const other = { ...entry, id: 'other', merchant: '다른 결제' };
    const amount = vi.fn();
    render(<UndecidedPanel entries={[entry, other]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} onSupportAmountChange={amount} />);
    const toggle = screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'support-amount-portion');
    const input = screen.getByLabelText('지원금 일부 결제 지원금 반영 금액');
    expect(input.closest('.support-amount-editor')).toHaveAttribute('id', 'support-amount-portion');
    expect(input.parentElement?.firstElementChild).toHaveTextContent('지원금 반영 금액');
    expect(input.closest('article')).toBe(toggle.closest('article'));
    expect(screen.queryByLabelText('다른 결제 지원금 반영 금액')).not.toBeInTheDocument();
    expect(screen.queryByText(/중 지원금으로 처리할 금액만 입력/)).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '30000' } });
    fireEvent.blur(input);
    expect(amount).toHaveBeenCalledWith('portion', 30000);
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('지원금 일부 결제 지원금 반영 금액')).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액')).toHaveValue('30000');
  });
  it('updates the main amount after saving and removes the original subtitle when restored to full support', () => {
    const props = { items: POLICY_ITEMS, onClassify: vi.fn(), onExclude: vi.fn(), onSupportAmountChange: vi.fn() };
    const { rerender } = render(<UndecidedPanel {...props} entries={[entry]} />);
    const toggle = screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액'), { target: { value: '30000' } });
    fireEvent.blur(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액'));
    expect(props.onSupportAmountChange).toHaveBeenCalledWith(entry.id, 30000);
    rerender(<UndecidedPanel {...props} entries={[{ ...entry, supportAmount: 30000 }]} />);
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('지원금 30,000원');
    expect(screen.getByText('원결제 50,000원')).toBeInTheDocument();
    expect(document.querySelector('.support-amount-controls')).toBeNull();
    rerender(<UndecidedPanel {...props} entries={[{ ...entry, supportAmount: 50000 }]} />);
    expect(toggle).toHaveTextContent('50,000원');
    expect(screen.queryByText(/원결제/)).not.toBeInTheDocument();
  });
  it.each(['', '0', '-1', '1.5', '50001', '9007199254740992'])('cannot bypass invalid amount %s by closing the input', (value) => {
    const amount = vi.fn(); const classify = vi.fn();
    render(<UndecidedPanel entries={[entry]} items={POLICY_ITEMS} onClassify={classify} onExclude={vi.fn()} onSupportAmountChange={amount} />);
    fireEvent.click(screen.getByLabelText('지원금 일부 결제 선택'));
    const toggle = screen.getByRole('button', { name: '지원금 일부 결제 지원금 반영 금액 수정' });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText('지원금 일부 결제 지원금 반영 금액'), { target: { value } });
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    expect(amount).not.toHaveBeenCalled(); expect(classify).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
  it('keeps partial-cancellation review and an already saved portion visible while folded', () => {
    const partial = { ...entry, cancelledAmount: 35000, supportAmountReviewRequired: true, previousSupportAmount: 30000 };
    const saved = { ...entry, id: 'saved', merchant: '저장된 일부 결제', supportAmount: 20000 };
    render(<UndecidedPanel entries={[partial, saved]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} onSupportAmountChange={vi.fn()} />);
    expect(screen.getByText(/부분 취소 · 금액 재확인 필요/)).toBeInTheDocument();
    expect(screen.getByText('이전 지원금 반영 30,000원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '저장된 일부 결제 지원금 반영 금액 수정' })).toHaveTextContent('지원금 20,000원');
    const savedCard = screen.getByText('저장된 일부 결제').closest('article')!;
    expect(within(savedCard).getByText('원결제 50,000원')).toBeInTheDocument();
    expect(savedCard.querySelector('.support-amount-controls')).toBeNull();
    expect(savedCard.querySelector('.reclassify-card__merchant time')).toHaveTextContent('2026-09-20 12:00');
    const reviewCard = screen.getByText('지원금 일부 결제').closest('article')!;
    expect(within(reviewCard).getByRole('button')).toHaveTextContent('50,000원');
    expect(within(reviewCard).queryByText('원결제 50,000원')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('지원금 일부 결제 지원금 반영 금액')).not.toBeInTheDocument();
  });
  it('does not offer amount editing until duplicate review has been resolved', () => {
    render(<UndecidedPanel entries={[{ ...entry, duplicateCandidateIds: ['old'] }]} allEntries={[entry, { ...entry, id: 'old' }]} items={POLICY_ITEMS} onClassify={vi.fn()} onExclude={vi.fn()} onSupportAmountChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /지원금 반영 금액 수정/ })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText('지원금 일부 결제 중복 확인')).getByText('같은 거래인가요?')).toBeInTheDocument();
  });
});
