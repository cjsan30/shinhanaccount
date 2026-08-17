import { fireEvent, render, screen } from '@testing-library/react';
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

  it('opens direct expense registration instead of consuming the SMS queue', () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 지출 직접 등록' }));
    expect(screen.getByRole('heading', { name: '직접 지출 등록' })).toBeInTheDocument();
    expect(screen.getByLabelText('상호명')).toBeInTheDocument();
    expect(smsBridge.consumePendingApprovals).not.toHaveBeenCalled();
  });
  it('stores a manually entered expense without acknowledging the SMS queue', () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 지출 직접 등록' }));
    fireEvent.change(screen.getByLabelText('상호명'), { target: { value: '삼성웰스토리' } });
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: '지출 등록' }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText(/삼성웰스토리/)).toBeInTheDocument();
    expect(smsBridge.acknowledgePendingApprovals).not.toHaveBeenCalled();
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

  it('adds, edits, and deletes a contains-based merchant rule', () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /데이터 관리/ }));
    fireEvent.click(screen.getByRole('button', { name: '규칙 관리' }));
    fireEvent.change(screen.getByLabelText('규칙 상호명'), { target: { value: 'MegaCoffee' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));

    expect(screen.getByText('MegaCoffee')).toBeInTheDocument();
    expect(screen.getByText('포함 · 식비')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('규칙 인식 방법'), { target: { value: 'exact' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 수정 저장' }));
    expect(screen.getByText('정확히 일치 · 식비')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('저장된 자동 분류 규칙이 없습니다.')).toBeInTheDocument();
    confirm.mockRestore();
  });
});
