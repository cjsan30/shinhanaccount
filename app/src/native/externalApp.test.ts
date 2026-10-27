import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, open: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native }, registerPlugin: () => ({ open: mocks.open }) }));
import { openShinhanSolPay } from './externalApp';

afterEach(() => vi.restoreAllMocks());

describe('openShinhanSolPay', () => {
  beforeEach(() => { mocks.native = false; mocks.open.mockReset(); });

  it('asks Android to open SOL Pay before falling back to Play Store', async () => {
    mocks.native = true;
    mocks.open.mockResolvedValue({ opened: true, target: 'app' });
    await expect(openShinhanSolPay()).resolves.toEqual({ opened: true, target: 'app' });
    expect(mocks.open).toHaveBeenCalledWith({ packageId: 'com.shcard.smartpay', playStoreUrl: 'https://play.google.com/store/apps/details?id=com.shcard.smartpay' });
  });

  it('opens the Play Store in a browser when the native bridge is unavailable', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openShinhanSolPay()).resolves.toEqual({ opened: true, target: 'store' });
    expect(open).toHaveBeenCalledWith('https://play.google.com/store/apps/details?id=com.shcard.smartpay', '_blank', 'noopener,noreferrer');
  });
});
