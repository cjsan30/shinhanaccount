import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LedgerEntry } from '../domain/ledger';
import { PaymentHistory } from './PaymentHistory';

const entries: LedgerEntry[] = Array.from({ length: 12 }, (_, index) => ({
  id: `payment-${index}`,
  cardLast4: '3741',
  occurredAt: `2026-08-${String(19 - index).padStart(2, '0')}T12:30:00+09:00`,
  amount: 1000 + index,
  merchant: `상호 ${index}`,
  status: 'classified',
  bucket: 'resident',
  category: 'food',
  periodKey: '2026-08',
}));

describe('payment history', () => {
  it('shows ten entries per page and opens an entry from the row', () => {
    const open = vi.fn();
    render(<PaymentHistory entries={entries} categoryNames={{ food: '식비' }} onOpen={open} />);
    expect(screen.getByText('전체 기간 동안 총 12건의 결제가 있었습니다.')).toBeInTheDocument();
    expect(screen.getByText('상호 0')).toBeInTheDocument();
    expect(screen.queryByText('상호 10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByText('상호 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /상호 10/ }));
    expect(open).toHaveBeenCalledWith(entries[10]);
  });

  it('moves to the next page with a left swipe', () => {
    const { container } = render(<PaymentHistory entries={entries} categoryNames={{ food: '식비' }} onOpen={() => undefined} />);
    const history = container.querySelector('.payment-history');
    expect(history).not.toBeNull();
    fireEvent.touchStart(history!, { changedTouches: [{ clientX: 300 }] });
    fireEvent.touchEnd(history!, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByText('상호 10')).toBeInTheDocument();
  });
});
