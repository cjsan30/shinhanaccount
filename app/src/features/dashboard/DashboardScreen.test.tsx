import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardScreen } from './DashboardScreen';

function renderDashboard(forceStopRecovery = false) {
  const actions = {
    onOpenSettings: vi.fn(), onDismissRecovery: vi.fn(), onRecoverTransactions: vi.fn(), onNewPayment: vi.fn(),
    onOpenResident: vi.fn(), onOpenStudy: vi.fn(), onOpenUndecided: vi.fn(), onOpenRecent: vi.fn(), onOpenEvidence: vi.fn(),
  };
  render(<DashboardScreen totalLimit={700000} totalSpent={120000} totalUsage={17.1} resident={{ remaining: 420000, usage: 16 }} study={{ remaining: 160000, usage: 20 }} undecidedCount={2} forceStopRecovery={forceStopRecovery} {...actions} />);
  return actions;
}

describe('dashboard recovery notice', () => {
  it('offers import recovery and one-time dismissal after a detected force stop', () => {
    const actions = renderDashboard(true);
    expect(screen.getByRole('alert')).toHaveTextContent('결제 알림 인식이 중단된 시간이 있습니다');
    fireEvent.click(screen.getByRole('button', { name: '거래내역 가져오기' }));
    fireEvent.click(screen.getByRole('button', { name: '나중에' }));
    expect(actions.onRecoverTransactions).toHaveBeenCalledOnce();
    expect(actions.onDismissRecovery).toHaveBeenCalledOnce();
  });

  it('does not reserve dashboard space when recovery is not needed', () => {
    renderDashboard(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('580,000원')).toBeInTheDocument();
  });
});
