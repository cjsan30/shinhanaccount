import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge } = vi.hoisted(() => ({ smsBridge: { requestPermission: vi.fn() }, notificationBridge: { requestPermission: vi.fn() } }));
vi.mock('../native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('../native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
import { FirstRunPermission } from './FirstRunPermission';

beforeEach(() => {
  vi.clearAllMocks();
  smsBridge.requestPermission.mockResolvedValue({ granted: true });
  notificationBridge.requestPermission.mockResolvedValue({ granted: true });
});

describe('first-run permissions', () => {
  it('requests permissions before continuing to policy setup', async () => {
    const complete = vi.fn();
    render(<FirstRunPermission onComplete={complete} />);
    fireEvent.change(screen.getByLabelText('초기 카드 끝 4자리'), { target: { value: '1111' } });
    fireEvent.click(screen.getByRole('button', { name: '권한 허용 후 시작' }));
    await waitFor(() => expect(complete).toHaveBeenCalledWith('1111'));
    expect(smsBridge.requestPermission).toHaveBeenCalledOnce();
    expect(notificationBridge.requestPermission).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});
