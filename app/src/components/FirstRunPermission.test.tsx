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

  it('can skip onboarding from permission setup', async () => {
    const complete = vi.fn();
    const skip = vi.fn();
    render(<FirstRunPermission onComplete={complete} onSkip={skip} />);
    fireEvent.click(screen.getByRole('button', { name: '넘어가기' }));
    expect(skip).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
  });
});
