import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessibilitySettings } from './AccessibilitySettings';

describe('accessibility settings', () => {
  it('changes text scale and keeps the remaining preferences', () => {
    const onChange = vi.fn();
    render(<AccessibilitySettings preferences={{ textScale: 'default', highContrast: false, vibration: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '크게' }));
    expect(onChange).toHaveBeenCalledWith({ textScale: 'large', highContrast: false, vibration: true });
  });

  it('toggles high contrast and vibration independently', () => {
    const onChange = vi.fn();
    render(<AccessibilitySettings preferences={{ textScale: 'small', highContrast: false, vibration: false }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('고대비 모드'));
    fireEvent.click(screen.getByLabelText('진동 피드백'));
    expect(onChange).toHaveBeenNthCalledWith(1, { textScale: 'small', highContrast: true, vibration: false });
    expect(onChange).toHaveBeenNthCalledWith(2, { textScale: 'small', highContrast: false, vibration: true });
    expect(screen.getByText('읽기와 조작 방식을 이 기기에서만 조정합니다.')).toBeInTheDocument();
  });
});
