import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

describe('bottom sheet navigation', () => {
  it('resets scroll and keeps navigation available when the destination changes', () => {
    const { rerender } = render(<BottomSheet title="Data" onClose={vi.fn()}><div>Content</div></BottomSheet>);
    const sheet = screen.getByRole('dialog');
    sheet.scrollTop = 480;

    rerender(<BottomSheet title="Rules" onClose={vi.fn()} onBack={vi.fn()}><div>Rule screen</div></BottomSheet>);

    expect(sheet.scrollTop).toBe(0);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Rules/ })).toBeInTheDocument();
  });
});
