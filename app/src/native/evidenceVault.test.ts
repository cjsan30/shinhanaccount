import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: false, save: vi.fn(async () => ({ id: 'saved', size: 3 })), read: vi.fn(async () => ({ base64Data: 'AQID', size: 3 })), remove: vi.fn(async () => undefined) }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => mocks.native }, registerPlugin: () => mocks }));
vi.mock('./fileExport', () => ({ bytesToBase64: () => 'local-image-bytes' }));
import { loadEvidence, removeStoredEvidence, retryPendingEvidenceRemovals, storeEvidence } from './evidenceVault';

describe('original evidence storage', () => {
  beforeEach(() => { mocks.native = false; vi.clearAllMocks(); });
  it('keeps browser-selected files available while the app is running and removes them on request', async () => {
    const file = new File(['local'], 'receipt.jpg', { type: 'image/jpeg' });
    const stored = await storeEvidence(file);
    expect(await loadEvidence(stored)).toBe(file);
    expect(mocks.save).not.toHaveBeenCalled();
    await removeStoredEvidence(stored);
    await expect(loadEvidence(stored)).rejects.toThrow('다시 선택');
  });
  it('never treats a missing original as a successful empty file', async () => {
    await expect(loadEvidence({ id: 'does-not-exist', fileName: 'lost.jpg', mimeType: 'image/jpeg', size: 3, attachedAt: '2026-09-20' })).rejects.toThrow();
  });
  it('uses only the native encrypted vault on Android, not browser localStorage', async () => {
    mocks.native = true;
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    const file = new File(['abc'], 'native.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3]).buffer });
    const stored = await storeEvidence(file);
    expect(mocks.save).toHaveBeenCalledWith({ id: stored.id, base64Data: 'local-image-bytes' });
    const restored = await loadEvidence(stored);
    expect(restored.name).toBe(file.name); expect(restored.size).toBe(3);
    await removeStoredEvidence(stored);
    expect(mocks.remove).toHaveBeenCalledWith({ id: stored.id });
    expect(storage).not.toHaveBeenCalled(); storage.mockRestore();
  });

  describe('failed deletions (decision 2026-11-17)', () => {
    const stored = (id: string) => ({ id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', size: 3, attachedAt: '2026-09-20' });
    beforeEach(() => { mocks.native = true; window.localStorage.clear(); });

    it('remembers only the id of a file that could not be deleted and deletes it on the next start', async () => {
      mocks.remove.mockRejectedValueOnce(new Error('busy'));
      await expect(removeStoredEvidence(stored('stuckfile1'))).rejects.toThrow('busy');
      expect(window.localStorage.getItem('shinhanhae-evidence-pending-removal-v1')).toBe('["stuckfile1"]');
      mocks.remove.mockClear();
      await retryPendingEvidenceRemovals(new Set());
      expect(mocks.remove).toHaveBeenCalledWith({ id: 'stuckfile1' });
      expect(window.localStorage.getItem('shinhanhae-evidence-pending-removal-v1')).toBeNull();
    });

    it('keeps an id that fails again and never deletes one still used by an attachment', async () => {
      window.localStorage.setItem('shinhanhae-evidence-pending-removal-v1', JSON.stringify(['stuckagain', 'stillused1']));
      mocks.remove.mockRejectedValueOnce(new Error('busy'));
      await retryPendingEvidenceRemovals(new Set(['stillused1']));
      expect(mocks.remove).toHaveBeenCalledTimes(1);
      expect(mocks.remove).toHaveBeenCalledWith({ id: 'stuckagain' });
      expect(window.localStorage.getItem('shinhanhae-evidence-pending-removal-v1')).toBe('["stuckagain"]');
    });

    it('writes nothing when deletions succeed', async () => {
      await removeStoredEvidence(stored('cleanfile1'));
      expect(window.localStorage.getItem('shinhanhae-evidence-pending-removal-v1')).toBeNull();
    });
  });
});
