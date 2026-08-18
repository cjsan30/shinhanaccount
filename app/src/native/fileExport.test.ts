import { expect, it } from 'vitest';
import { bytesToBase64, timestampedFileName } from './fileExport';

it('encodes binary data for native filesystem writes', () => {
  expect(bytesToBase64(new Uint8Array([0, 255, 12, 64]))).toBe('AP8MQA==');
});

it('adds a Korea-time timestamp so exports never overwrite an earlier file', () => {
  expect(timestampedFileName('report.pdf', new Date('2026-08-18T16:23:45.000Z'))).toBe('report_20260819_012345.pdf');
  expect(timestampedFileName('backup', new Date('2026-08-18T16:23:45.000Z'))).toBe('backup_20260819_012345');
});
