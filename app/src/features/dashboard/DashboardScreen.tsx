import { CaretRight, ChatCircleDots, GearSix, ListBullets, Plus, Question } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

type BudgetCard = { remaining: number; usage: number };
type Props = {
  totalLimit: number;
  totalSpent: number;
  totalUsage: number;
  resident: BudgetCard;
  study: BudgetCard;
  undecidedCount: number;
  forceStopRecovery: boolean;
  onOpenHelp?: () => void;
  onOpenSettings: () => void;
  onDismissRecovery: () => void;
  onRecoverTransactions: () => void;
  onNewPayment: () => void;
  onOpenResident: () => void;
  onOpenStudy: () => void;
  onOpenUndecided: () => void;
  onOpenRecent: () => void;
  onOpenEvidence: () => void;
  onImportTransactions?: () => void;
  /** Shown to an existing user whose new policy period has no confirmed plan yet. */
  planPending?: { canReuse: boolean; onReuse: () => void; onEdit: () => void };
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** The budget name, remaining amount and arrow share one row only when all of them fit. */
export function budgetHeadingFits(rowWidth: number, nameWidth: number, amountWidth: number, iconWidth: number, gap: number) {
  return nameWidth + amountWidth + iconWidth + gap * 2 <= rowWidth;
}
/** Scale that keeps text on one line: 1 when it already fits, otherwise just small enough. */
export function fitScale(available: number, needed: number) {
  return needed <= available || available <= 0 ? 1 : Math.floor((available / needed) * 1000) / 1000;
}

// Large system or app font sizes can make dashboard text wider than its row. Text widths are
// measured from the glyphs, so the layout changes only when the text really does not fit.
const textWidth = (element: Element) => {
  const range = document.createRange();
  range.selectNodeContents(element);
  return typeof range.getBoundingClientRect === 'function' ? range.getBoundingClientRect().width : 0;
};
function useFitOnResize(ref: RefObject<HTMLElement | null>, fit: (element: HTMLElement) => void) {
  const latest = useRef(fit);
  useLayoutEffect(() => {
    latest.current = fit;
    if (ref.current) fit(ref.current);
  });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => latest.current(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
}

function Budget({ name, value, open }: { name: string; value: BudgetCard; open: () => void }) {
  const row = useRef<HTMLSpanElement>(null);
  const [stacked, setStacked] = useState(false);
  useFitOnResize(row, (element) => {
    const [label, amount] = element.children;
    const style = getComputedStyle(element);
    const iconWidth = parseFloat(style.gridTemplateColumns.split(' ').pop() ?? '') || 0;
    setStacked(!budgetHeadingFits(element.clientWidth, textWidth(label), textWidth(amount), iconWidth, parseFloat(style.columnGap) || 0));
  });
  return <button className={stacked ? 'budget budget--stacked' : 'budget'} onClick={open} aria-label={`${name} 상세 보기`}><span ref={row}><strong>{name}</strong><em>잔액 {won(value.remaining)}</em><CaretRight size={27} weight="bold" /></span><i><b style={{ width: `${Math.min(100, value.usage)}%` }} /></i><small>{value.usage.toFixed(1)}% 사용</small></button>;
}

export function DashboardScreen(props: Props) {
  const total = useRef<HTMLElement>(null);
  useFitOnResize(total, (element) => {
    element.style.zoom = '';
    const scale = fitScale(element.clientWidth, textWidth(element));
    if (scale < 1) element.style.zoom = String(scale);
  });
  return <>
    <header><h1>지원금 관리</h1><div className="dashboard-header-actions">{props.onOpenHelp && <button className="app-help-trigger" aria-label="앱 사용 도움말" onClick={props.onOpenHelp}><Question size={25} /></button>}<button className="settings-button" aria-label="설정 열기" onClick={props.onOpenSettings}><GearSix size={34} /></button></div></header>
    {props.forceStopRecovery && <section className="recovery-notice" role="alert"><strong>결제 알림 인식이 중단된 시간이 있습니다</strong><p>강제 종료 또는 알림 접근 중단 중에는 결제가 자동 반영되지 않을 수 있습니다. 빠진 내역이 있다면 카드 CSV·Excel 또는 은행 PDF를 가져와 확인해 주세요.</p><div><button onClick={props.onRecoverTransactions}>거래내역 가져오기</button><button onClick={props.onDismissRecovery}>나중에</button></div></section>}
    {props.planPending && <section className="recovery-notice plan-pending-notice" role="status"><strong>이번 기간 계획표를 확정해 주세요</strong><p>확정하기 전에 받은 결제는 보관만 하고 예산에는 반영하지 않습니다. 확정하면 바로 반영합니다.</p><div>{props.planPending.canReuse && <button onClick={props.planPending.onReuse}>지난 계획 그대로 확정</button>}<button onClick={props.planPending.onEdit}>수정 후 확정</button></div></section>}
    <section className="summary"><div className="summary-heading"><p>총 잔액</p><button className="new-payment" aria-label="새 지출 직접 등록" onClick={props.onNewPayment}><Plus size={16} weight="bold" />새 지출</button></div><strong ref={total}>{won(props.totalLimit - props.totalSpent)}</strong><span>{won(props.totalLimit)} 중 {won(props.totalSpent)} 사용 · {props.totalUsage.toFixed(1)}%</span><i><b style={{ width: `${Math.min(100, props.totalUsage)}%` }} /></i></section>
    <section className="budgets"><Budget name="정주비" value={props.resident} open={props.onOpenResident} /><Budget name="학습공간비" value={props.study} open={props.onOpenStudy} /></section>
    <section className="quick"><h2>빠른 확인</h2>{props.onImportTransactions && <button onClick={props.onImportTransactions}><i><ListBullets size={29} /></i>거래내역 가져오기<CaretRight size={25} /></button>}<button data-guide="undecided" aria-label={`분류 필요 ${props.undecidedCount}건`} onClick={props.onOpenUndecided}><i><ChatCircleDots size={29} /></i><span>분류 필요</span>{props.undecidedCount > 0 && <b className="undecided-badge" aria-hidden="true">{props.undecidedCount > 9 ? '9+' : props.undecidedCount}</b>}<CaretRight size={25} /></button><button data-guide="history" onClick={props.onOpenRecent}><i><ListBullets size={29} /></i>결제 내역 확인<CaretRight size={25} /></button><button data-guide="export" onClick={props.onOpenEvidence}><i><ListBullets size={29} /></i>PDF 생성<CaretRight size={25} /></button></section>
  </>;
}
