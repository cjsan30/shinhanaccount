import { fireEvent, render, screen, within } from '@testing-library/react';
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
    render(<PaymentHistory entries={entries} categoryNames={{ food: '식비' }} filterOptions={[{ key: 'food', label: '식비' }]} isEntryInActivePeriod={() => true} onOpen={open} />);
    expect(screen.getByText('전체 기간 동안 총 12건의 결제가 있었습니다.')).toBeInTheDocument();
    expect(screen.getByText('상호 0')).toBeInTheDocument();
    expect(screen.queryByText('상호 10')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 페이지' }));
    expect(screen.getByText('상호 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /상호 10/ }));
    expect(open).toHaveBeenCalledWith(entries[10]);
  });

  it('moves to the next page with a left swipe', () => {
    const { container } = render(<PaymentHistory entries={entries} categoryNames={{ food: '식비' }} filterOptions={[{ key: 'food', label: '식비' }]} isEntryInActivePeriod={() => true} onOpen={() => undefined} />);
    const history = container.querySelector('.payment-history');
    expect(history).not.toBeNull();
    fireEvent.touchStart(history!, { changedTouches: [{ clientX: 300 }] });
    fireEvent.touchEnd(history!, { changedTouches: [{ clientX: 100 }] });
    expect(screen.getByText('상호 10')).toBeInTheDocument();
  });

  it('filters by a detailed category and sorts by amount', () => {
    const mixed = [{ ...entries[0], id: 'cafe', merchant: '카페', category: 'generalCafe', amount: 9000 }, { ...entries[1], id: 'food', merchant: '식당', category: 'food', amount: 2000 }];
    render(<PaymentHistory entries={mixed} categoryNames={{ food: '식비', generalCafe: '카페' }} filterOptions={[{ key: 'food', label: '식비' }, { key: 'generalCafe', label: '카페' }]} isEntryInActivePeriod={() => true} onOpen={() => undefined} />);
    fireEvent.change(screen.getByLabelText('결제 내역 세부항목 필터'), { target: { value: 'generalCafe' } });
    expect(screen.getByRole('button', { name: /카페/ })).toBeInTheDocument();
    expect(screen.queryByText('식당')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('결제 내역 세부항목 필터'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('결제 내역 정렬'), { target: { value: 'amount-asc' } });
    expect(screen.getAllByRole('button').find((button) => button.textContent?.includes('식당'))).toBeTruthy();
  });

  it('keeps excluded payments visible with their exclusion status so they can be restored', () => {
    const excluded = [{ ...entries[0], id: 'excluded', merchant: '개인 지출', status: 'excluded' as const, bucket: undefined, category: undefined }];
    render(<PaymentHistory entries={excluded} categoryNames={{ food: '식비' }} filterOptions={[{ key: 'food', label: '식비' }]} isEntryInActivePeriod={() => true} onOpen={() => undefined} />);
    expect(screen.getByText('사업 무관 제외')).toBeInTheDocument();
  });

  it('makes a partial cancellation visible without hiding the remaining payment', () => {
    const partial = [{ ...entries[0], id: 'partial', merchant: '부분 취소 결제', amount: 10000, cancelledAmount: 3000 }];
    render(<PaymentHistory entries={partial} categoryNames={{ food: '식비' }} filterOptions={[{ key: 'food', label: '식비' }]} isEntryInActivePeriod={() => true} onOpen={() => undefined} />);
    expect(screen.getByText('부분 취소 · 3,000원 취소')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /부분 취소 결제/ })).toBeInTheDocument();
  });
});

describe('history query and preserved state', () => {
  it('shows a saved portion above the original, keeps full payments simple, and opens the original entry', () => {
    const portion = { ...entries[0], merchant: '일부 반영 결제', amount: 50000, supportAmount: 30000 };
    const full = { ...entries[1], merchant: '전액 결제', amount: 50000, supportAmount: 50000 };
    const open = vi.fn();
    render(<PaymentHistory entries={[portion, full]} categoryNames={{ food: '식비' }} filterOptions={[]} isEntryInActivePeriod={() => true} onOpen={open} />);
    const row = screen.getByRole('button', { name: /일부 반영 결제/ });
    expect(within(row).getByText('원결제 50,000원').closest('.payment-row__amount')).not.toBeNull();
    expect(row.querySelector('.payment-row__amount b')).toHaveTextContent('지원금 30,000원');
    expect(within(screen.getByRole('button', { name: /전액 결제/ })).queryByText(/원결제/)).not.toBeInTheDocument();
    fireEvent.click(row);
    expect(open).toHaveBeenCalledWith(portion);
    expect(portion.amount).toBe(50000);
  });
  it('sorts by the prominently displayed amount and still searches the original amount', () => {
    const portion = { ...entries[0], merchant: '일부 반영', amount: 50000, supportAmount: 5000 };
    const full = { ...entries[1], merchant: '전액', amount: 20000 };
    const { container } = render(<PaymentHistory entries={[portion, full]} categoryNames={{}} filterOptions={[]} isEntryInActivePeriod={() => true} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('결제 내역 정렬'), { target: { value: 'amount-desc' } });
    expect(container.querySelector('.payment-row')).toHaveTextContent('전액');
    fireEvent.change(screen.getByLabelText('결제 내역 정렬'), { target: { value: 'amount-asc' } });
    expect(container.querySelector('.payment-row')).toHaveTextContent('일부 반영');
    fireEvent.change(screen.getByLabelText('결제 내역 검색'), { target: { value: '50,000' } });
    expect(screen.getByText('일부 반영')).toBeInTheDocument();
    expect(screen.queryByText('전액')).not.toBeInTheDocument();
  });
  it('combines merchant/amount search with active period filtering', () => {
    render(<PaymentHistory entries={[{ ...entries[0], merchant: '원본 커피', supportAmount: 700 }, { ...entries[1], merchant: '다른 날짜' }]} categoryNames={{}} filterOptions={[]} isEntryInActivePeriod={(entry) => entry.id === entries[0].id} displayMerchant={(entry) => entry.id === entries[0].id ? '별칭 카페' : entry.merchant} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('결제 내역 검색'), { target: { value: '별칭' } });
    expect(screen.getByText('별칭 카페')).toBeInTheDocument(); expect(screen.queryByText('다른 날짜')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('결제 내역 검색'), { target: { value: '700' } });
    expect(screen.getByText('별칭 카페')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('결제 내역 검색'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('결제 내역 기간'), { target: { value: 'current' } });
    expect(screen.queryByText('다른 날짜')).not.toBeInTheDocument();
  });
  it('restores a supplied page/filter/search/sort after the detail screen unmounts it', () => {
    const props = { entries, categoryNames: {}, filterOptions: [{ key: 'food', label: '식비' }], isEntryInActivePeriod: () => true, onOpen: vi.fn() };
    const view = { page: 1, category: 'food', sort: 'latest' as const, query: '상호', period: 'current' as const };
    const first = render(<PaymentHistory {...props} view={view} />);
    expect(screen.getByText('상호 10')).toBeInTheDocument(); first.unmount();
    render(<PaymentHistory {...props} view={view} />);
    expect(screen.getByText('상호 10')).toBeInTheDocument();
    expect(screen.getByLabelText('결제 내역 검색')).toHaveValue('상호');
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });
});
