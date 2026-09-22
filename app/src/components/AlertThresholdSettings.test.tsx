import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AlertThresholdSettings } from './AlertThresholdSettings';
import { clampAlertThreshold } from '../domain/alertThresholds';

describe('alert threshold settings', () => {
  it('keeps custom sliders behind the compact preset control', () => {
    const onChange = vi.fn();
    render(<AlertThresholdSettings first={50} second={80} onChange={onChange} />);
    expect(screen.getByText('사용 50% · 80% 시, 잔액 50% · 20% 안내')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '변경' }));
    const first = screen.getByLabelText('첫 번째 경고 기준');
    const second = screen.getByLabelText('두 번째 경고 기준');
    expect(first).toHaveAttribute('min', '1');
    expect(first).toHaveAttribute('max', '99');
    expect(second).toHaveAttribute('min', '1');
    expect(second).toHaveAttribute('max', '99');
    fireEvent.change(first, { target: { value: '60' } });
    expect(onChange).toHaveBeenCalledWith(0, 60);
    fireEvent.click(screen.getByRole('button', { name: /빠른 경고/ }));
    expect(onChange).toHaveBeenCalledWith(0, 40);
    expect(onChange).toHaveBeenCalledWith(1, 70);
  });

  it('clamps only the slider being moved when thresholds would cross', () => {
    expect(clampAlertThreshold(0, 90, [50, 80])).toEqual([79, 80]);
    expect(clampAlertThreshold(1, 40, [50, 80])).toEqual([50, 51]);
  });
});
