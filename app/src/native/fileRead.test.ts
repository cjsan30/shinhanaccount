import { describe, expect, it } from 'vitest';
import { readSelectedFile } from './fileRead';

describe('readSelectedFile', () => {
  it('reads a selected browser file through its ArrayBuffer API', async () => {
    const file = new File(['shinhan-card-export'], 'history.xls', { type: 'application/vnd.ms-excel' });

    const result = await readSelectedFile(file);

    expect(new TextDecoder().decode(result)).toBe('shinhan-card-export');
  });

  it('uses FileReader when an older Android WebView has no ArrayBuffer API', async () => {
    const source = new Blob(['legacy-webview']);
    const original = globalThis.FileReader;
    class LegacyFileReader {
      result: ArrayBuffer | null = null;
      error: Error | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer(blob: Blob) {
        void blob.arrayBuffer().then((value) => { this.result = value; this.onload?.(); }).catch((error) => { this.error = error; this.onerror?.(); });
      }
    }
    globalThis.FileReader = LegacyFileReader as unknown as typeof FileReader;
    try {
      const result = await readSelectedFile(source as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> });
      expect(new TextDecoder().decode(result)).toBe('legacy-webview');
    } finally {
      globalThis.FileReader = original;
    }
  });

  it('returns a readable error when the FileReader fallback fails', async () => {
    const original = globalThis.FileReader;
    class FailingFileReader {
      result: ArrayBuffer | null = null;
      error = new Error('native read failed');
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer() { this.onerror?.(); }
    }
    globalThis.FileReader = FailingFileReader as unknown as typeof FileReader;
    try {
      await expect(readSelectedFile({} as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> })).rejects.toThrow('native read failed');
    } finally {
      globalThis.FileReader = original;
    }
  });
});
