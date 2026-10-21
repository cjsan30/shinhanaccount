import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OperationsSettings } from './OperationsSettings';
import { SettingsHub } from './SettingsHub';

vi.mock('../../components/SmsDiagnostics', () => ({ SmsDiagnostics: () => null }));

describe('SettingsHub', () => {
  it('opens each destination and hides the internal verification entry outside internal builds', () => {
    const onOpen = vi.fn();
    render(<SettingsHub onOpen={onOpen} />);
    for (const name of [/운영 설정/, /데이터 관리/, /접근성 · 개인화/, /앱 안내·정보 출처/]) fireEvent.click(screen.getByRole('button', { name }));
    expect(onOpen.mock.calls.map(([destination]) => destination)).toEqual(['operations', 'data', 'accessibility', 'information']);
    expect(screen.queryByRole('button', { name: /실기기 검증/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /피드백 보내기/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
  });
});

describe('OperationsSettings', () => {
  const props = (patch: Partial<Parameters<typeof OperationsSettings>[0]> = {}) => ({
    card: '1234', showCard: false, onToggleShowCard: vi.fn(), onCardChange: vi.fn(), paymentAlertsEnabled: true, budgetAlertsEnabled: false,
    onTogglePaymentAlerts: vi.fn(), onToggleBudgetAlerts: vi.fn(), thresholds: [50, 80] as [number, number], onThresholdChange: vi.fn(), notify: vi.fn(), ...patch,
  });

  it('masks the card digits until shown and passes raw input to the caller', () => {
    const p = props();
    const { rerender } = render(<OperationsSettings {...p} />);
    expect(screen.getByLabelText('카드 끝 4자리')).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '보기' }));
    expect(p.onToggleShowCard).toHaveBeenCalled();
    rerender(<OperationsSettings {...p} showCard />);
    expect(screen.getByLabelText('카드 끝 4자리')).toHaveAttribute('type', 'text');
    fireEvent.change(screen.getByLabelText('카드 끝 4자리'), { target: { value: '12a' } });
    expect(p.onCardChange).toHaveBeenCalledWith('12a');
  });

  it('explains an incomplete card number and labels each alert button by its state', () => {
    const p = props({ card: '12' });
    render(<OperationsSettings {...p} />);
    expect(screen.getByText('카드 4자리를 모두 입력하면 결제 알림 수신이 다시 시작됩니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '결제 알림 수신 해제' }));
    fireEvent.click(screen.getByRole('button', { name: '예산 경고 알림 설정' }));
    expect(p.onTogglePaymentAlerts).toHaveBeenCalled();
    expect(p.onToggleBudgetAlerts).toHaveBeenCalled();
  });
});
