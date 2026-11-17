import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataIntegrityPanel } from './DataIntegrityPanel';

describe('data integrity panel', () => {
  beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));

  it('no longer shows the 누락 가능성 점검 counts', () => {
    render(<DataIntegrityPanel onReset={vi.fn()} />);
    expect(screen.queryByText('누락 가능성 점검')).not.toBeInTheDocument();
    expect(screen.getByText('데이터 초기화')).toBeInTheDocument();
  });

  it('resets only selected scopes after confirmation and retains selection when cancelled', () => {
    const onReset = vi.fn(); render(<DataIntegrityPanel onReset={onReset} />);
    const button = screen.getByRole('button', { name: '선택한 데이터 초기화' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText('결제 내역과 분류 필요 결제'));
    fireEvent.click(screen.getByLabelText('확정·예약 정책'));
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(button);
    expect(onReset).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    fireEvent.click(button);
    expect(onReset).toHaveBeenCalledWith(['ledger', 'policy']);
    expect(button).toBeDisabled();
  });
});
