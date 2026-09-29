import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransactionImport } from './TransactionImport';

describe('transaction import', () => {
  it('switches accepted formats without changing the configured notification card', () => {
    const { container, getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', expect.stringContaining('.xls'));
    expect(input?.getAttribute('accept')).toContain('.csv');
    expect(container.textContent).toContain('CSV');
    expect(container.textContent).toContain('신한카드 앱 열기');
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('loop');
    expect(video?.muted).toBe(true);
    expect(video?.querySelector('source')).toHaveAttribute('src', '/onboarding-shinhan-solpay-excel-guide.mp4');
    act(() => { fireEvent.click(getByLabelText('계좌번호')); });
    expect(input).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    expect(getByLabelText('계좌 끝 4자리')).toHaveValue('');
    expect(getByLabelText('PDF 비밀번호')).toHaveAttribute('type', 'password');
  });

  it('clears the PDF password when the import type changes', () => {
    const { getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);
    fireEvent.click(getByLabelText('계좌번호'));
    fireEvent.change(getByLabelText('PDF 비밀번호'), { target: { value: 'temporary-password' } });
    fireEvent.click(getByLabelText('카드번호'));
    fireEvent.click(getByLabelText('계좌번호'));
    expect(getByLabelText('PDF 비밀번호')).toHaveValue('');
  });
});
