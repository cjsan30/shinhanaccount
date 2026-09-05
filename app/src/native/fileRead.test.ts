import { describe, expect, it } from 'vitest';
import { readSelectedFile } from './fileRead';

describe('readSelectedFile', () => {
  it('reads a selected browser file through its ArrayBuffer API', async () => {
    const file = new File(['shinhan-card-export'], 'history.xls', { type: 'application/vnd.ms-excel' });

    const result = await readSelectedFile(file);

    expect(new TextDecoder().decode(result)).toBe('shinhan-card-export');
  });
});
