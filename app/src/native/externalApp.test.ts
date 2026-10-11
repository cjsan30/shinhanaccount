import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, openWebsite: vi.fn(), open: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native }, registerPlugin: () => ({ openWebsite: mocks.openWebsite, open: mocks.open }) }));
import { openInformationWebsite, openShinhanSolPay } from './externalApp';
import { OFFICIAL_PROGRAM_URL } from '../domain/appInformation';

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
describe('official source navigation', () => {
  beforeEach(() => { mocks.native = false; vi.clearAllMocks(); });
  it('opens a separate browser tab without changing the app URL', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null); const before = window.location.href;
    await openInformationWebsite(OFFICIAL_PROGRAM_URL);
    expect(open).toHaveBeenCalledWith(OFFICIAL_PROGRAM_URL, '_blank', 'noopener,noreferrer');
    expect(window.location.href).toBe(before); open.mockRestore();
  });
  it('uses the Android browser plugin, never in-WebView navigation', async () => {
    mocks.native = true; mocks.openWebsite.mockResolvedValue({ opened: true });
    await expect(openInformationWebsite(OFFICIAL_PROGRAM_URL)).resolves.toEqual({ opened: true });
    expect(mocks.openWebsite).toHaveBeenCalledWith({ url: OFFICIAL_PROGRAM_URL });
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it.each(['javascript:alert(1)', 'http://shinchunghae.co.kr/', 'https://shinchunghae.co.kr.evil.test/', 'https://evil.test/', 'https://shinchunghae.co.kr/?account=1234'])('rejects a non-approved destination %s', async (url) => {
    mocks.native = true;
    await expect(openInformationWebsite(url)).rejects.toThrow('허용되지 않은 정보 출처');
    expect(mocks.openWebsite).not.toHaveBeenCalled();
  });
});
