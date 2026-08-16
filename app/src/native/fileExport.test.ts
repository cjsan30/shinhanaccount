import { expect, it } from 'vitest';
import { bytesToBase64 } from './fileExport';

it('encodes binary data for native filesystem writes', () => {
  expect(bytesToBase64(new Uint8Array([0, 255, 12, 64]))).toBe('AP8MQA==');
});
