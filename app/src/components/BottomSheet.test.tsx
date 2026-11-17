import { render, screen, waitFor } from '@testing-library/react';
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

  it('moves focus into the sheet when it opens and gives it back to the opener when it closes', async () => {
    const opener = document.createElement('button'); opener.textContent = 'open'; document.body.append(opener); opener.focus();
    const { unmount } = render(<BottomSheet title="Plan" onClose={vi.fn()}><div>Plan</div></BottomSheet>);
    expect(screen.getByRole('dialog')).toHaveFocus();
    unmount();
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });

  it('keeps focus on a control inside the sheet when the title changes', () => {
    const { rerender } = render(<BottomSheet title="Plan" onClose={vi.fn()}><button>inside</button></BottomSheet>);
    screen.getByRole('button', { name: 'inside' }).focus();
    rerender(<BottomSheet title="Adjust" onClose={vi.fn()}><button>inside</button></BottomSheet>);
    expect(screen.getByRole('button', { name: 'inside' })).toHaveFocus();
  });
});
