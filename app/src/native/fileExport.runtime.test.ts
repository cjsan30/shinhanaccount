import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ isNativePlatform: vi.fn(), save: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  registerPlugin: () => ({ save: mocks.save }),
}));

import { saveFile } from './fileExport';

describe('saveFile runtime paths', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    mocks.isNativePlatform.mockReset(); mocks.save.mockReset();
  });
  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it('downloads a browser file without calling the native plugin', async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    URL.createObjectURL = vi.fn(() => 'blob:report');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    const result = await saveFile('report.pdf', new Uint8Array([1, 2, 3]), 'application/pdf');

    expect(result).toMatchObject({ location: 'download', relativePath: 'Downloads' });
    expect(result.fileName).toMatch(/^report_\d{8}_\d{6}\.pdf$/);
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it('passes binary data to the native downloads plugin', async () => {
    mocks.isNativePlatform.mockReturnValue(true);
    mocks.save.mockResolvedValue({ uri: 'content://downloads/report.pdf', fileName: 'report.pdf', relativePath: 'Downloads' });

    const result = await saveFile('report.pdf', new Uint8Array([0, 255]), 'application/pdf');

    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ base64Data: 'AP8=', mimeType: 'application/pdf' }));
    expect(result).toMatchObject({ location: 'downloads', relativePath: 'Downloads' });
  });
});
