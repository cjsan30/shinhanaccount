import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ledger } from '../domain/ledger';
import { DataIntegrityPanel } from './DataIntegrityPanel';

const ledger: Ledger = { alertThresholds: [50, 80], entries: [
  { id: 'undecided', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '카페', amount: 5000, status: 'undecided' as const },
  { id: 'outside', cardLast4: '1234', occurredAt: '2026-09-13T12:00:00+09:00', merchant: '기간 외', amount: 5000, status: 'classified' as const, bucket: 'resident', category: 'food' },
] };

describe('data integrity panel', () => {
  beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => true)));

  it('summarizes undecided and outside-period records and exposes latest import undo', () => {
    const onUndoImport = vi.fn(); render(<DataIntegrityPanel ledger={ledger} periodKey="2026-09" canUndoImport onUndoImport={onUndoImport} onReset={vi.fn()} />);
    expect(screen.getByText('미정 지출')).toHaveTextContent('1건');
    expect(screen.getByText('현재 적용 기간 외 결제')).toHaveTextContent('1건');
    fireEvent.click(screen.getByRole('button', { name: '방금 가져온 내역 실행 취소' }));
    expect(onUndoImport).toHaveBeenCalledOnce();
  });

  it('resets only selected scopes after confirmation and retains selection when cancelled', () => {
    const onReset = vi.fn(); render(<DataIntegrityPanel ledger={ledger} periodKey="2026-09" canUndoImport={false} onUndoImport={vi.fn()} onReset={onReset} />);
    const button = screen.getByRole('button', { name: '선택한 데이터 초기화' });
    expect(button).toBeDisabled();
    fireEvent.click(screen.getByLabelText('결제 내역과 미정 지출'));
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
