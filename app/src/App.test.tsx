import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge } = vi.hoisted(() => ({ smsBridge: { configure: vi.fn(), requestPermission: vi.fn(), consumePendingApprovals: vi.fn() } }));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
import App from './App';

beforeEach(() => {
  vi.clearAllMocks();
  smsBridge.configure.mockResolvedValue(undefined);
  smsBridge.requestPermission.mockResolvedValue({ granted: true });
  smsBridge.consumePendingApprovals.mockResolvedValue({ items: [] });
});

describe('support fund home', () => {
  it('shows the primary budget summary and quick actions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '지원금 관리' })).toBeInTheDocument();
    expect(screen.getByText('406,600원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /정주비 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새 결제 확인' })).toBeInTheDocument();
  });

  it('opens a budget detail in a bottom sheet', () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: /정주비 상세 보기/ }));
    expect(screen.getByRole('dialog', { name: '정주비 상세' })).toBeInTheDocument();
    expect(screen.getByText('숙박비')).toBeInTheDocument();
  });

  it('configures the card and requests SMS permission', async () => {
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('카드 끝 4자리'), { target: { value: '3741' } });
    fireEvent.click(screen.getByRole('button', { name: 'SMS 수신 사용' }));
    await waitFor(() => expect(smsBridge.configure).toHaveBeenCalledWith({ cardLast4: '3741' }));
    expect(smsBridge.requestPermission).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('SMS 수신을 사용할 수 있습니다.');
  });

  it('uses a pending native approval in the payment confirmation sheet', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 8000, merchant: '삼성웰스토리(주)크래프톤정' }] });
    render(<App />); fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    expect(await screen.findByText('삼성웰스토리(주)크래프톤정')).toBeInTheDocument();
    expect(smsBridge.consumePendingApprovals).toHaveBeenCalledOnce();
  });
});