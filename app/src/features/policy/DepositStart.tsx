import { useState } from 'react';
import type { Ledger } from '../../domain/ledger';
import type { PolicyFunding } from '../../domain/policy';
import { getDepositDateChoices, getPaymentsOnDate, resolveDepositStart, type FirstPaymentChoice } from '../../domain/policyStart';

type Props = {
  periodKey: string;
  now: Date;
  ledger: Ledger;
  /** Asks first whether the subsidy has arrived; otherwise goes straight to the date. */
  askDeposited: boolean;
  onConfirm: (funding: PolicyFunding) => void;
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const dayLabel = (date: string) => { const [, month, day] = date.split('-').map(Number); return `${month}월 ${day}일`; };
const timeLabel = (value: string) => new Date(value).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });

/** Chooses when the period starts: the deposit date, then the first payment after it. */
export function DepositStart({ periodKey, now, ledger, askDeposited, onConfirm }: Props) {
  const [step, setStep] = useState<'choice' | 'date' | 'first'>(askDeposited ? 'choice' : 'date');
  const [date, setDate] = useState('');
  const [choice, setChoice] = useState<FirstPaymentChoice | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { buttons, calendar } = getDepositDateChoices(periodKey, now);
  const payments = date ? getPaymentsOnDate(ledger, date) : [];
  const pickDate = (value: string) => {
    if (!value) return;
    if (!getPaymentsOnDate(ledger, value).length) { onConfirm(resolveDepositStart(ledger, value)); return; }
    setDate(value); setChoice(null); setStep('first');
  };

  if (step === 'choice') return <section className="deposit-start" aria-label="지원금 입금 여부">
    <h3>지원금이 입금됐나요?</h3>
    <div className="deposit-start__actions">
      <button type="button" className="sheet-action" onClick={() => setStep('date')}>입금됐어요</button>
      <button type="button" className="sheet-action secondary-action" onClick={() => onConfirm({ status: 'pending' })}>아직이에요</button>
    </div>
  </section>;

  if (step === 'date') return <section className="deposit-start" aria-label="지원금 입금 날짜">
    <h3>지원금이 입금된 날짜를 골라 주세요</h3>
    <div className="deposit-start__dates">{buttons.map((value) => <button type="button" key={value} onClick={() => pickDate(value)}>{dayLabel(value)}</button>)}</div>
    {calendar && (calendarOpen
      ? <input className="deposit-start__calendar" aria-label="입금 날짜 선택" type="date" min={calendar.min} max={calendar.max} onClick={(event) => event.currentTarget.showPicker?.()} onChange={(event) => { if (event.target.value >= calendar.min && event.target.value <= calendar.max) pickDate(event.target.value); }} />
      : <button type="button" className="deposit-start__calendar-toggle" onClick={() => setCalendarOpen(true)}>캘린더</button>)}
  </section>;

  return <section className="deposit-start" aria-label="입금 후 첫 결제">
    <h3>{dayLabel(date)} 결제 중 입금 후 첫 결제를 골라 주세요</h3>
    <div className="deposit-start__payments" role="radiogroup" aria-label={`${dayLabel(date)} 결제`}>
      {payments.map((payment) => <label key={payment.id}><input type="radio" name="first-payment" checked={choice !== null && choice !== 'none' && choice.entryId === payment.id} onChange={() => setChoice({ entryId: payment.id })} /><span>{timeLabel(payment.occurredAt)}</span><b>{payment.merchant}</b><em>{won(payment.amount)}</em></label>)}
      <label><input type="radio" name="first-payment" checked={choice === 'none'} onChange={() => setChoice('none')} /><b>이 날은 입금 후 결제 없음</b></label>
    </div>
    <button type="button" className="sheet-action" disabled={!choice} onClick={() => { if (choice) onConfirm(resolveDepositStart(ledger, date, choice)); }}>확인</button>
    <button type="button" className="sheet-action secondary-action" onClick={() => setStep('date')}>날짜 다시 고르기</button>
  </section>;
}
