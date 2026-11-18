import { CaretRight, ChatCircleDots, GearSix, ListBullets, Plus, Question } from '@phosphor-icons/react';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { budgetHeadingFits, fitScale } from '../../domain/textFit';

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
  /** Verification build only. */
  onOpenVerifyTools?: () => void;
  onImportTransactions?: () => void;
  /** "이번 기간 ○ ~ ○ · 계획 보기": opens the plan of the period. */
  period?: { label: string; onOpen: () => void };
  /** Replaces the budget while there is nothing to count yet (see DashboardStatus). */
  status?: DashboardStatus;
};

/**
 * `no-plan`: the new period opened (11th) without a plan. `pending`: the plan is
 * confirmed but the subsidy has not arrived. `ask`: a plan from before the deposit
 * start with nothing counted yet, asked once whether the subsidy arrived.
 */
export type DashboardStatus =
  | { kind: 'no-plan'; onRegister: () => void }
  | { kind: 'pending'; onDeposited: () => void }
  | { kind: 'ask'; onDeposited: () => void; onNotYet: () => void };

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

function StatusCard({ status, onNewPayment }: { status: DashboardStatus; onNewPayment: () => void }) {
  const title = status.kind === 'no-plan' ? '새 기간 계획을 등록해 주세요' : status.kind === 'pending' ? '지원금 입금 대기' : '지원금이 입금됐나요?';
  const body = status.kind === 'no-plan' ? '계획을 등록하기 전 결제는 보관만 하고 예산에는 반영하지 않습니다.' : '입금 전 결제는 보관만 하고 예산에는 반영하지 않습니다.';
  return <section className="summary dashboard-status" role="status">
    <div className="summary-heading"><p>{title}</p><button className="new-payment" aria-label="새 지출 직접 등록" onClick={onNewPayment}><Plus size={16} weight="bold" />새 지출</button></div>
    <span>{body}</span>
    <div className="dashboard-status__actions">
      {status.kind === 'no-plan' && <button type="button" onClick={status.onRegister}>새 계획 등록</button>}
      {status.kind !== 'no-plan' && <button type="button" onClick={status.onDeposited}>{status.kind === 'pending' ? '지원금 입금됐어요' : '입금됐어요'}</button>}
      {status.kind === 'ask' && <button type="button" className="secondary" onClick={status.onNotYet}>아직이에요</button>}
    </div>
  </section>;
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
    {props.forceStopRecovery && <section className="recovery-notice" role="alert"><strong>결제 알림 인식이 중단된 시간이 있습니다</strong><p>강제 종료 또는 알림 접근 중단 중에는 결제가 자동 반영되지 않을 수 있습니다. <br />빠진 내역이 있다면 카드 CSV·Excel 또는 은행 PDF를 가져와 확인해 주세요.</p><div><button onClick={props.onRecoverTransactions}>거래내역 가져오기</button><button onClick={props.onDismissRecovery}>나중에</button></div></section>}
    {props.status ? <StatusCard status={props.status} onNewPayment={props.onNewPayment} /> : <><section className="summary"><div className="summary-heading"><p>총 잔액</p><button className="new-payment" aria-label="새 지출 직접 등록" onClick={props.onNewPayment}><Plus size={16} weight="bold" />새 지출</button></div><strong ref={total}>{won(props.totalLimit - props.totalSpent)}</strong><span>{won(props.totalLimit)} 중 {won(props.totalSpent)} 사용 · {props.totalUsage.toFixed(1)}%</span><i><b style={{ width: `${Math.min(100, props.totalUsage)}%` }} /></i></section>
    {props.period && <button type="button" className="period-line" onClick={props.period.onOpen}><span>이번 기간 {props.period.label}</span><b>계획 보기</b><CaretRight size={18} /></button>}
    <section className="budgets"><Budget name="정주비" value={props.resident} open={props.onOpenResident} /><Budget name="학습공간비" value={props.study} open={props.onOpenStudy} /></section></>}
    <section className="quick"><h2>바로가기</h2>{props.onImportTransactions && <button data-guide="import" onClick={props.onImportTransactions}><i><ListBullets size={29} /></i>거래내역 가져오기<CaretRight size={25} /></button>}<button data-guide="undecided" aria-label={`분류 필요 ${props.undecidedCount}건`} onClick={props.onOpenUndecided}><i><ChatCircleDots size={29} /></i><span>분류 필요</span>{props.undecidedCount > 0 && <b className="undecided-badge" aria-hidden="true">{props.undecidedCount > 9 ? '9+' : props.undecidedCount}</b>}<CaretRight size={25} /></button><button data-guide="history" onClick={props.onOpenRecent}><i><ListBullets size={29} /></i>결제 내역 확인<CaretRight size={25} /></button><button data-guide="export" onClick={props.onOpenEvidence}><i><ListBullets size={29} /></i>사용보고서 작성<CaretRight size={25} /></button>{props.onOpenVerifyTools && <button onClick={props.onOpenVerifyTools}><i><ListBullets size={29} /></i>검증 도구<CaretRight size={25} /></button>}</section>
  </>;
}
