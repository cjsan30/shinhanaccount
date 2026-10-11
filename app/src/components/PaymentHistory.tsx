import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useMemo, useRef, useState } from 'react';
import { getSupportAmount, type LedgerEntry } from '../domain/ledger';
import { getPaymentAmountDisplay } from '../domain/paymentAmountDisplay';

const PAGE_SIZE = 10;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const localDateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const displayDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value));
const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

import { INITIAL_HISTORY_VIEW, type HistoryView, type HistorySort as Sort } from '../domain/historyView';
type FilterOption = { key: string; label: string };
type Props = { entries: LedgerEntry[]; categoryNames: Record<string, string>; filterOptions: FilterOption[]; isEntryInActivePeriod: (entry: LedgerEntry) => boolean; displayMerchant?: (entry: LedgerEntry) => string; isSuspectedDuplicate?: (entry: LedgerEntry) => boolean; onOpen: (entry: LedgerEntry) => void; view?: HistoryView; onViewChange?: (view: HistoryView) => void };

export function PaymentHistory({ entries, categoryNames, filterOptions, isEntryInActivePeriod, displayMerchant = (entry) => entry.merchant, isSuspectedDuplicate = () => false, onOpen, view, onViewChange }: Props) {
  const [localView, setLocalView] = useState<HistoryView>(INITIAL_HISTORY_VIEW);
  const current = view ?? localView;
  const { page: requestedPage, category, sort, query, period } = current;
  const change = (patch: Partial<HistoryView>) => { const next = { ...current, ...patch }; setLocalView(next); onViewChange?.(next); };
  const setCategory = (category: string) => change({ category, page: 0 });
  const setSort = (sort: Sort) => change({ sort, page: 0 });
  const touchStartX = useRef<number | null>(null);
  const filteredEntries = useMemo(() => entries.filter((entry) => (category === 'all' || entry.category === category) && (period === 'all' || isEntryInActivePeriod(entry)) && (!query.trim() || [entry.merchant, displayMerchant(entry), String(entry.amount), String(getSupportAmount(entry))].some((value) => value.toLowerCase().includes(query.trim().toLowerCase().replaceAll(',', ''))))).slice().sort((left, right) => {
    if (sort === 'oldest') return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
    if (sort === 'amount-desc') return getPaymentAmountDisplay(right).primaryAmount - getPaymentAmountDisplay(left).primaryAmount || right.occurredAt.localeCompare(left.occurredAt);
    if (sort === 'amount-asc') return getPaymentAmountDisplay(left).primaryAmount - getPaymentAmountDisplay(right).primaryAmount || right.occurredAt.localeCompare(left.occurredAt);
    return right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id);
  }), [category, entries, sort, query, period, isEntryInActivePeriod, displayMerchant]);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount - 1);
  const pageEntries = useMemo(() => filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredEntries, page]);
  const movePage = (direction: -1 | 1) => change({ page: Math.max(0, Math.min(pageCount - 1, page + direction)) });
  const finishSwipe = (endX: number) => {
    if (touchStartX.current === null) return;
    const distance = endX - touchStartX.current;
    if (Math.abs(distance) >= 55) movePage(distance < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  if (!entries.length) return <p>저장된 결제 내역이 없습니다.</p>;
  let previousDate = '';
  return <section className="payment-history" onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}>
    <p className="payment-history__summary">전체 기간 동안 총 {entries.length}건의 결제가 있었습니다.</p>
    <label className="history-search">결제 검색<input aria-label="결제 내역 검색" type="search" placeholder="상호명 또는 금액" value={query} onChange={(event) => change({ query: event.target.value, page: 0 })} /></label>
    <label>조회 기간<select aria-label="결제 내역 기간" value={period} onChange={(event) => change({ period: event.target.value as HistoryView['period'], page: 0 })}><option value="all">전체 기간</option><option value="current">현재 적용 기간</option></select></label>
    <div className="payment-history__controls"><label>세부항목<select aria-label="결제 내역 세부항목 필터" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">전체 항목</option>{filterOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>정렬<select aria-label="결제 내역 정렬" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="latest">최신순</option><option value="oldest">오래된순</option><option value="amount-desc">금액 높은순</option><option value="amount-asc">금액 낮은순</option></select></label></div>
    {!filteredEntries.length ? <p className="payment-history__empty">조건에 맞는 결제 내역이 없습니다.</p> : <div className="payment-history__page" key={`${page}-${category}-${sort}`}>
      {pageEntries.map((entry) => {
        const date = localDateKey(entry.occurredAt);
        const showDate = date !== previousDate;
        previousDate = date;
        const subtitle = entry.status === 'cancelled' ? '취소됨' : entry.status === 'excluded' ? '사업 무관 제외' : entry.cancelledAmount ? `부분 취소 · ${won(entry.cancelledAmount)} 취소` : categoryNames[entry.category ?? ''] || '분류 없음';
        const outsidePeriod = !isEntryInActivePeriod(entry);
        const { isPortion, primaryAmount } = getPaymentAmountDisplay(entry);
        return <div key={entry.id}>{showDate && <h3 className="payment-date">{displayDate(entry.occurredAt)}</h3>}<button className="payment-row" type="button" onClick={() => onOpen(entry)}><span className="payment-row__main"><span className="payment-row__merchant"><strong>{displayMerchant(entry)}</strong><small><time>{displayTime(entry.occurredAt)}</time>{subtitle}{entry.supportAmountReviewRequired && <em>금액 재확인 필요</em>}{outsidePeriod && <em>기간 외</em>}{isSuspectedDuplicate(entry) && <em className="duplicate-badge">중복 의심</em>}</small></span><span className="payment-row__amount"><b>{isPortion && <em>지원금 </em>}{won(primaryAmount)}</b>{isPortion && <span className="payment-original-amount">원결제 {won(entry.amount)}</span>}</span></span><CaretRight size={21} /></button></div>;
      })}
    </div>}
    {filteredEntries.length > PAGE_SIZE && <nav className="payment-pagination" aria-label="결제 내역 페이지"><button type="button" aria-label="이전 페이지" disabled={page === 0} onClick={() => movePage(-1)}><CaretLeft size={22} /></button><span>{page + 1} / {pageCount}</span><button type="button" aria-label="다음 페이지" disabled={page >= pageCount - 1} onClick={() => movePage(1)}><CaretRight size={22} /></button></nav>}
  </section>;
}
