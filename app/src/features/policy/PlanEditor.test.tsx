import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyPolicy } from '../../domain/policy';
import { PlanEditor } from './PlanEditor';

const draft = { ...emptyPolicy, plans: { ...emptyPolicy.plans, housing: 300000, food: 200000, cafe: 200000 } };
const props = () => ({ text: '', draft, focusToken: 1, submitLabel: '계획 저장', onTextChange: vi.fn(), onReviewText: vi.fn(), onReadScreenshot: vi.fn(), onUpdateAmount: vi.fn(), onUpdateProfile: vi.fn(), onToggleAlertTarget: vi.fn(), onAddCustomItem: vi.fn(() => true), onRemoveCustomItem: vi.fn(), onSubmit: vi.fn() });

describe('plan editor', () => {
  it('reads, edits and submits the reviewed plan', () => {
    const value = props(); render(<PlanEditor {...value} />);
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: '식비 200,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    fireEvent.change(screen.getByLabelText('정책 지원 유형'), { target: { value: 'shinhanhae-40' } });
    fireEvent.change(screen.getByLabelText('주거비 계획 금액'), { target: { value: '200000' } });
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.click(screen.getByRole('button', { name: '계획 저장' }));
    expect(value.onTextChange).toHaveBeenCalledWith('식비 200,000원');
    expect(value.onReviewText).toHaveBeenCalledOnce();
    expect(value.onReadScreenshot).toHaveBeenCalledOnce();
    expect(value.onUpdateProfile).toHaveBeenCalledWith('shinhanhae-40');
    expect(value.onUpdateAmount).toHaveBeenCalledWith('housing', '200000');
    expect(value.onToggleAlertTarget).toHaveBeenCalledWith('housing');
    expect(value.onSubmit).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText('정책 기간 시작일')).not.toBeInTheDocument();
  });

  it('scrolls to the result only when a plan was just read, not while typing amounts', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 0; });
    const value = props();
    const view = render(<PlanEditor {...value} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    view.rerender(<PlanEditor {...value} draft={{ ...draft, plans: { ...draft.plans, food: 2 } }} />);
    view.rerender(<PlanEditor {...value} draft={{ ...draft, plans: { ...draft.plans, food: 25 } }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    view.rerender(<PlanEditor {...value} focusToken={2} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
