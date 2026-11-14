import { useState, type ReactNode } from 'react';
import { getPolicyLimit, getPolicyItems, type PolicyFunding, type SupportPolicy } from '../../domain/policy';
import type { LedgerEntry } from '../../domain/ledger';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const dateLabel = (date: string) => { const [, month, day] = date.split('-').map(Number); return `${month}월 ${day}일`; };

type PlanViewProps = {
  policy: SupportPolicy;
  funding?: PolicyFunding;
  range: { start: string; end: string };
  onEditPlan: () => void;
  onEditStart: () => void;
  onDeposited: () => void;
};

/** The period's plan, opened from the dashboard: amounts, the start, and where to change them. */
export function PlanView({ policy, funding, range, onEditPlan, onEditStart, onDeposited }: PlanViewProps) {
  const amountOf = (key: string, category: string) => key in policy.plans ? policy.plans[key as keyof SupportPolicy['plans']] : policy.customItems?.find((custom) => `custom:${custom.id}` === category)?.amount ?? 0;
  const items = getPolicyItems(policy).filter((item) => amountOf(item.key, item.ledgerCategories[0]) > 0);
  const pending = funding?.status === 'pending';
  return <section className="plan-view">
    <div className="plan-view__period">
      <strong>{pending ? '지원금 입금 대기' : `${dateLabel(range.start)} ~ ${dateLabel(range.end)}`}</strong>
      {pending ? <button type="button" className="sheet-action" onClick={onDeposited}>지원금 입금됐어요</button> : <button type="button" className="sheet-action secondary-action" onClick={onEditStart}>정책 시작 날짜 수정</button>}
    </div>
    {(['resident', 'studySpace'] as const).map((bucket) => <section className="policy-group" key={bucket}>
      <h4>{bucket === 'resident' ? '정주비' : '학습공간비'} <span>{won(getPolicyLimit(policy, bucket))}</span></h4>
      {items.filter((item) => item.bucket === bucket).map((item) => <p className="plan-view__item" key={item.key}><span>{item.label}</span><b>{won(amountOf(item.key, item.ledgerCategories[0]))}</b></p>)}
    </section>)}
    <button type="button" className="sheet-action" onClick={onEditPlan}>계획 수정</button>
  </section>;
}

type ReincludeProps = { entries: LedgerEntry[]; onConfirm: (entryIds: string[]) => void };

/** After the start moves earlier: payments that come back into the period, all chosen at first. */
export function ReincludePayments({ entries, onConfirm }: ReincludeProps) {
  const [chosen, setChosen] = useState(() => new Set(entries.map((entry) => entry.id)));
  const toggle = (id: string) => setChosen((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <section className="reinclude">
    <h3>다시 포함할 결제 {entries.length}건</h3>
    <button type="button" className="reinclude__clear" onClick={() => setChosen(new Set())}>전체 해제</button>
    <div className="reinclude__list">{entries.map((entry) => <label key={entry.id}><input type="checkbox" checked={chosen.has(entry.id)} onChange={() => toggle(entry.id)} /><span>{new Date(entry.occurredAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span><b>{entry.merchant}</b><em>{won(entry.amount)}</em></label>)}</div>
    <button type="button" className="sheet-action" onClick={() => onConfirm([...chosen])}>확인</button>
  </section>;
}

/** New period: reuse the previous plan or read a new one, then choose the deposit state. */
export function NewPlan({ canReuse, onReuse, editor }: { canReuse: boolean; onReuse: () => void; editor: ReactNode }) {
  return <section className="new-plan">
    {canReuse && <button type="button" className="sheet-action secondary-action" onClick={onReuse}>지난 계획 그대로 쓰기</button>}
    {editor}
  </section>;
}
