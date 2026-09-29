import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isNativePlatform: vi.fn(), open: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => ({ open: mocks.open }),
}));

import { openShinhanSolPay } from './externalApp';

describe('openShinhanSolPay', () => {
  beforeEach(() => { mocks.isNativePlatform.mockReset(); mocks.open.mockReset(); });
  afterEach(() => vi.restoreAllMocks());

  it('asks Android to open SOL Pay before falling back to Play Store', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.open.mockResolvedValue({ opened: true, target: 'app' });

    await expect(openShinhanSolPay()).resolves.toEqual({ opened: true, target: 'app' });
    expect(mocks.open).toHaveBeenCalledWith({ packageId: 'com.shcard.smartpay', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.shcard.smartpay' });
  });

  it('opens the Play Store in a browser when the native bridge is unavailable', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);

    await expect(openShinhanSolPay()).resolves.toEqual({ opened: true, target: 'store' });
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=com.shcard.smartpay', '_blank', 'noopener,noreferrer');
  });
});
