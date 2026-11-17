import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccessibilitySettings } from './AccessibilitySettings';

describe('accessibility settings', () => {
  it('changes text scale and keeps the remaining preferences', () => {
    const onChange = vi.fn();
    render(<AccessibilitySettings preferences={{ textScale: 'default', vibration: true }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: '크게' }));
    expect(onChange).toHaveBeenCalledWith({ textScale: 'large', vibration: true });
  });

  it('toggles vibration and no longer offers a high contrast mode', () => {
    const onChange = vi.fn();
    render(<AccessibilitySettings preferences={{ textScale: 'small', vibration: false }} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('진동 피드백'));
    expect(onChange).toHaveBeenCalledWith({ textScale: 'small', vibration: true });
    expect(screen.queryByLabelText('고대비 모드')).not.toBeInTheDocument();
    expect(screen.getByText('읽기와 조작 방식을 이 기기에서만 조정합니다.')).toBeInTheDocument();
  });
});
