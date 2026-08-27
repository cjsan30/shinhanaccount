import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LedgerEntry } from '../domain/ledger';

const PAGE_SIZE = 10;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const localDateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const displayDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value));
const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

type Sort = 'latest' | 'oldest' | 'amount-desc' | 'amount-asc';
type FilterOption = { key: string; label: string };
type Props = { entries: LedgerEntry[]; categoryNames: Record<string, string>; filterOptions: FilterOption[]; isEntryInActivePeriod: (entry: LedgerEntry) => boolean; displayMerchant?: (entry: LedgerEntry) => string; isSuspectedDuplicate?: (entry: LedgerEntry) => boolean; onOpen: (entry: LedgerEntry) => void };

export function PaymentHistory({ entries, categoryNames, filterOptions, isEntryInActivePeriod, displayMerchant = (entry) => entry.merchant, isSuspectedDuplicate = () => false, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<Sort>('latest');
  const touchStartX = useRef<number | null>(null);
  const filteredEntries = useMemo(() => entries.filter((entry) => category === 'all' || entry.category === category).slice().sort((left, right) => {
    if (sort === 'oldest') return left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id);
    if (sort === 'amount-desc') return right.amount - left.amount || right.occurredAt.localeCompare(left.occurredAt);
    if (sort === 'amount-asc') return left.amount - right.amount || right.occurredAt.localeCompare(left.occurredAt);
    return right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id);
  }), [category, entries, sort]);
  const pageCount = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  useEffect(() => { setPage(0); }, [category, sort]);
  useEffect(() => { setPage((current) => Math.min(current, pageCount - 1)); }, [pageCount]);
  const pageEntries = useMemo(() => filteredEntries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredEntries, page]);
  const movePage = (direction: -1 | 1) => setPage((current) => Math.max(0, Math.min(pageCount - 1, current + direction)));
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
    <div className="payment-history__controls"><label>세부항목<select aria-label="결제 내역 세부항목 필터" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">전체 항목</option>{filterOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><label>정렬<select aria-label="결제 내역 정렬" value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="latest">최신순</option><option value="oldest">오래된순</option><option value="amount-desc">금액 높은순</option><option value="amount-asc">금액 낮은순</option></select></label></div>
    {!filteredEntries.length ? <p className="payment-history__empty">선택한 세부항목의 결제 내역이 없습니다.</p> : <div className="payment-history__page" key={`${page}-${category}-${sort}`}>
      {pageEntries.map((entry) => {
        const date = localDateKey(entry.occurredAt);
        const showDate = date !== previousDate;
        previousDate = date;
        const subtitle = entry.status === 'cancelled' ? '취소됨' : categoryNames[entry.category ?? ''] || '분류 없음';
        const outsidePeriod = !isEntryInActivePeriod(entry);
        return <div key={entry.id}>{showDate && <h3 className="payment-date">{displayDate(entry.occurredAt)}</h3>}<button className="payment-row" type="button" onClick={() => onOpen(entry)}><span className="payment-row__main"><strong>{displayMerchant(entry)}</strong><time>{displayTime(entry.occurredAt)}</time><b>{won(entry.amount)}</b></span><small>{subtitle}{outsidePeriod && <em>기간 외</em>}{isSuspectedDuplicate(entry) && <em className="duplicate-badge">중복 의심</em>}</small><CaretRight size={21} /></button></div>;
      })}
    </div>}
    {filteredEntries.length > PAGE_SIZE && <nav className="payment-pagination" aria-label="결제 내역 페이지"><button type="button" aria-label="이전 페이지" disabled={page === 0} onClick={() => movePage(-1)}><CaretLeft size={22} /></button><span>{page + 1} / {pageCount}</span><button type="button" aria-label="다음 페이지" disabled={page >= pageCount - 1} onClick={() => movePage(1)}><CaretRight size={22} /></button></nav>}
  </section>;
}
