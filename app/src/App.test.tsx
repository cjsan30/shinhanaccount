import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge } = vi.hoisted(() => ({
  smsBridge: { configure: vi.fn(), getConfiguration: vi.fn(), syncBudgetState: vi.fn(), injectTestApproval: vi.fn(), scheduleTestApproval: vi.fn(), requestPermission: vi.fn(), consumePendingApprovals: vi.fn(), acknowledgePendingApprovals: vi.fn() },
  notificationBridge: { requestPermission: vi.fn(), show: vi.fn() },
}));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('./native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
import App from './App';
import { getPolicyPeriodKey } from './domain/budget';
import { createEmptyLedger } from './domain/ledger';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  smsBridge.getConfiguration.mockResolvedValue({ cardLast4: '' });
  smsBridge.syncBudgetState.mockResolvedValue(undefined);
  smsBridge.consumePendingApprovals.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingApprovals.mockResolvedValue(undefined);
});

describe('app entry flows', () => {
  it('shows policy onboarding when a new user has no confirmed policy', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /자동 관리를/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '지원금 관리' })).not.toBeInTheDocument();
  });

  it('preserves a confirmed policy and opens the dashboard for an existing user', () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    render(<App />);
    expect(screen.getByRole('heading', { name: '지원금 관리' })).toBeInTheDocument();
    expect(screen.getByText('700,000원')).toBeInTheDocument();
  });
});