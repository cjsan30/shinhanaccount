import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, confirm: vi.fn(), getConfirmation: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native }, registerPlugin: () => ({ confirm: mocks.confirm, getConfirmation: mocks.getConfirmation }) }));
import { loadInformationConfirmation, saveInformationConfirmation } from './appInformationPreference';
import { APP_INFORMATION_ACK_KEY } from '../domain/appInformation';
describe('durable information confirmation', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.native = false; });
  it('uses browser preference storage only on web', async () => {
    expect(await loadInformationConfirmation(localStorage)).toBe(false);
    expect(await saveInformationConfirmation(localStorage)).toBe(true);
    expect(await loadInformationConfirmation(localStorage)).toBe(true);
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
  it('waits for native disk confirmation and does not write WebView storage', async () => {
    mocks.native = true; mocks.confirm.mockResolvedValue({ confirmed: true }); mocks.getConfirmation.mockResolvedValue({ confirmed: true });
    expect(await saveInformationConfirmation(localStorage)).toBe(true);
    expect(await loadInformationConfirmation(localStorage)).toBe(true);
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBeNull();
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });
  it('does not silently confirm when the native write fails', async () => {
    mocks.native = true; mocks.confirm.mockRejectedValue(new Error('disk failure'));
    await expect(saveInformationConfirmation(localStorage)).rejects.toThrow('disk failure');
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBeNull();
  });
});
