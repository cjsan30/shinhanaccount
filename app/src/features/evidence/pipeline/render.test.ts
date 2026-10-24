import { afterEach, describe, expect, it, vi } from 'vitest';
import { jpeg } from './render';

describe('jpeg', () => {
  afterEach(() => vi.restoreAllMocks());

  it('encodes without toBlob, which can stall on Android WebViews without idle time', async () => {
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,/9j/AQID');
    await expect(jpeg(document.createElement('canvas'), .58)).resolves.toEqual(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]));
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', .58);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('fails instead of embedding another format when JPEG encoding is unavailable', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,');
    await expect(jpeg(document.createElement('canvas'), .8)).rejects.toThrow('이미지를 압축하지 못했습니다.');
  });
});
