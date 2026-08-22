import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionImport } from './TransactionImport';

describe('transaction import', () => {
  it('offers only the supported Shinhan Card Excel formats', () => {
    const { container } = render(<TransactionImport cardLast4="1111" onImport={vi.fn()} notify={vi.fn()} />);

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', expect.stringContaining('.xls'));
    expect(input?.getAttribute('accept')).not.toContain('.pdf');
    expect(container.textContent).not.toContain('PDF');
  });
});
