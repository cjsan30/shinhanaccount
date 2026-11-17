import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { emptyPolicy } from '../../domain/policy';
import { PlanView } from './PlanScreen';

const policy = { ...emptyPolicy, plans: { ...emptyPolicy.plans, food: 200000, education: 200000, transport: 100000, cafe: 200000 } };
const range = { start: '2026-11-15', end: '2026-12-10' };

describe('PlanView', () => {
  it('puts 예산 조정 next to 계획 수정 for a confirmed plan', () => {
    const onAdjust = vi.fn();
    render(<PlanView policy={policy} range={range} onEditPlan={vi.fn()} onAdjust={onAdjust} onEditStart={vi.fn()} onDeposited={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '예산 조정' }));
    expect(onAdjust).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '계획 수정' })).toBeInTheDocument();
  });

  it('leaves 예산 조정 out when there is nothing confirmed to adjust', () => {
    render(<PlanView policy={policy} range={range} onEditPlan={vi.fn()} onEditStart={vi.fn()} onDeposited={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '예산 조정' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계획 수정' })).toBeInTheDocument();
  });
});
