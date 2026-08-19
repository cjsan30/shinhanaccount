import { CaretRight, ChatCircleDots, GearSix, ListBullets, Plus } from '@phosphor-icons/react';

type BudgetCard = { remaining: number; usage: number };
type Props = {
  totalLimit: number;
  totalSpent: number;
  totalUsage: number;
  resident: BudgetCard;
  study: BudgetCard;
  undecidedCount: number;
  forceStopRecovery: boolean;
  onOpenSettings: () => void;
  onDismissRecovery: () => void;
  onRecoverTransactions: () => void;
  onNewPayment: () => void;
  onOpenResident: () => void;
  onOpenStudy: () => void;
  onOpenUndecided: () => void;
  onOpenRecent: () => void;
  onOpenEvidence: () => void;
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

function Budget({ name, value, open }: { name: string; value: BudgetCard; open: () => void }) {
  return <button className="budget" onClick={open} aria-label={`${name} 상세 보기`}><span><strong>{name}</strong><em>잔액 {won(value.remaining)}</em><CaretRight size={27} weight="bold" /></span><i><b style={{ width: `${Math.min(100, value.usage)}%` }} /></i><small>{value.usage.toFixed(1)}% 사용</small></button>;
}

export function DashboardScreen(props: Props) {
  return <>
    <header><h1>지원금 관리</h1><button className="settings-button" aria-label="설정 열기" onClick={props.onOpenSettings}><GearSix size={34} /></button></header>
    {props.forceStopRecovery && <section className="recovery-notice" role="alert"><strong>결제 알림 인식이 중단된 시간이 있습니다</strong><p>강제 종료 또는 알림 접근 중단 중에는 결제가 자동 반영되지 않을 수 있습니다. 빠진 내역이 있다면 신한카드 엑셀로 확인해 주세요.</p><div><button onClick={props.onRecoverTransactions}>거래내역 가져오기</button><button onClick={props.onDismissRecovery}>나중에</button></div></section>}
    <section className="summary"><div className="summary-heading"><p>총 잔액</p><button className="new-payment" aria-label="새 지출 직접 등록" onClick={props.onNewPayment}><Plus size={16} weight="bold" />새 지출</button></div><strong>{won(props.totalLimit - props.totalSpent)}</strong><span>{won(props.totalLimit)} 중 {won(props.totalSpent)} 사용 · {props.totalUsage.toFixed(1)}%</span><i><b style={{ width: `${Math.min(100, props.totalUsage)}%` }} /></i></section>
    <section className="budgets"><Budget name="정주비" value={props.resident} open={props.onOpenResident} /><Budget name="학습공간비" value={props.study} open={props.onOpenStudy} /></section>
    <section className="quick"><h2>빠른 확인</h2><button aria-label={`미정 지출 ${props.undecidedCount}건`} onClick={props.onOpenUndecided}><i><ChatCircleDots size={29} /></i><span>미정 지출</span>{props.undecidedCount > 0 && <b className="undecided-badge" aria-hidden="true">{props.undecidedCount > 9 ? '9+' : props.undecidedCount}</b>}<CaretRight size={25} /></button><button onClick={props.onOpenRecent}><i><ListBullets size={29} /></i>결제 내역 확인<CaretRight size={25} /></button><button onClick={props.onOpenEvidence}><i><ListBullets size={29} /></i>PDF 생성<CaretRight size={25} /></button></section>
  </>;
}
