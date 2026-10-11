import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge } = vi.hoisted(() => ({ smsBridge: { getNotificationAccessStatus: vi.fn(), openNotificationAccessSettings: vi.fn() }, notificationBridge: { requestPermission: vi.fn() } }));
vi.mock('../native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('../native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
import { FirstRunPermission } from './FirstRunPermission';

beforeEach(() => {
  vi.clearAllMocks();
  smsBridge.getNotificationAccessStatus.mockResolvedValue({ granted: true });
  smsBridge.openNotificationAccessSettings.mockResolvedValue(undefined);
  notificationBridge.requestPermission.mockResolvedValue({ granted: true });
});

describe('first-run permissions', () => {
  it('requests permissions before continuing to policy setup', async () => {
    const complete = vi.fn();
    render(<FirstRunPermission onComplete={complete} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: '동의하고 알림 접근 설정' }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('1111'));
    expect(notificationBridge.requestPermission).toHaveBeenCalledOnce();
    expect(smsBridge.getNotificationAccessStatus).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('opens Android notification access before continuing when it is disabled', async () => {
    smsBridge.getNotificationAccessStatus.mockResolvedValue({ granted: false });
    const complete = vi.fn();
    render(<FirstRunPermission onComplete={complete} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: '동의하고 알림 접근 설정' }));
    await waitFor(() => expect(smsBridge.openNotificationAccessSettings).toHaveBeenCalledOnce());
    expect(complete).not.toHaveBeenCalled();
  });

  it('does not request permissions until exactly four card digits are entered', async () => {
    render(<FirstRunPermission onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '12a' } });
    fireEvent.click(screen.getByRole('button', { name: '동의하고 알림 접근 설정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('카드 끝 4자리를 입력해 주세요.');
    expect(notificationBridge.requestPermission).not.toHaveBeenCalled();
    expect(smsBridge.getNotificationAccessStatus).not.toHaveBeenCalled();
  });

  it('stops before notification access when app notifications are declined', async () => {
    notificationBridge.requestPermission.mockResolvedValue({ granted: false });
    const complete = vi.fn();
    render(<FirstRunPermission onComplete={complete} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: '동의하고 알림 접근 설정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('승인 결제와 예산 경고를 알려면 앱 알림을 허용해 주세요.');
    expect(smsBridge.getNotificationAccessStatus).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('shows a retryable message when a native permission bridge fails', async () => {
    notificationBridge.requestPermission.mockRejectedValue(new Error('bridge unavailable'));
    render(<FirstRunPermission onComplete={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: '동의하고 알림 접근 설정' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('권한 설정을 완료할 수 없습니다. Android 앱에서 다시 시도해 주세요.');
  });

  it('lets a user temporarily reveal the entered card suffix without changing it', () => {
    render(<FirstRunPermission onComplete={vi.fn()} />);
    const input = screen.getByLabelText('초기 카드 끝 4자리');
    fireEvent.change(input, { target: { value: '1111' } });
    expect(input).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: '카드 끝자리 보기' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveValue('1111');
  });

  it('can skip onboarding from permission setup', async () => {
    const complete = vi.fn();
    const skip = vi.fn();
    render(<FirstRunPermission onComplete={complete} onSkip={skip} />);
    fireEvent.click(screen.getByRole('button', { name: '넘어가기' }));
    expect(skip).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });
});
