import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LedgerEntry } from '../domain/ledger';

const PAGE_SIZE = 10;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const localDateKey = (value: string) => new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const displayDate = (value: string) => new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(value));
const displayTime = (value: string) => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));

type Props = { entries: LedgerEntry[]; categoryNames: Record<string, string>; onOpen: (entry: LedgerEntry) => void };

export function PaymentHistory({ entries, categoryNames, onOpen }: Props) {
  const [page, setPage] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  useEffect(() => { setPage((current) => Math.min(current, pageCount - 1)); }, [pageCount]);
  const pageEntries = useMemo(() => entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [entries, page]);
  const movePage = (direction: -1 | 1) => setPage((current) => Math.max(0, Math.min(pageCount - 1, current + direction)));
  const finishSwipe = (endX: number) => {
    if (touchStartX.current === null) return;
    const distance = endX - touchStartX.current;
    if (Math.abs(distance) >= 55) movePage(distance < 0 ? 1 : -1);
    touchStartX.current = null;
  };

  if (!entries.length) return <p>현재 정책 기간에 저장된 결제가 없습니다.</p>;
  let previousDate = '';
  return <section className="payment-history" onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={(event) => finishSwipe(event.changedTouches[0]?.clientX ?? 0)}>
    <p className="payment-history__summary">현재 정책 기간 결제 {entries.length}건 · 한 페이지에 10건씩 표시합니다.</p>
    <div className="payment-history__page" key={page}>
      {pageEntries.map((entry) => {
        const date = localDateKey(entry.occurredAt);
        const showDate = date !== previousDate;
        previousDate = date;
        const subtitle = entry.status === 'cancelled' ? '취소됨' : categoryNames[entry.category ?? ''] || '분류 없음';
        return <div key={entry.id}>{showDate && <h3 className="payment-date">{displayDate(entry.occurredAt)}</h3>}<button className="payment-row" type="button" onClick={() => onOpen(entry)}><span className="payment-row__main"><strong>{entry.merchant}</strong><time>{displayTime(entry.occurredAt)}</time><b>{won(entry.amount)}</b></span><small>{subtitle}</small><CaretRight size={21} /></button></div>;
      })}
    </div>
    <nav className="payment-pagination" aria-label="결제 내역 페이지"><button type="button" aria-label="이전 페이지" disabled={page === 0} onClick={() => movePage(-1)}><CaretLeft size={22} /></button><span>{page + 1} / {pageCount}</span><button type="button" aria-label="다음 페이지" disabled={page >= pageCount - 1} onClick={() => movePage(1)}><CaretRight size={22} /></button></nav>
  </section>;
}
