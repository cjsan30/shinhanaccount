import { useState } from 'react';
import { VERIFY_DATE_OFFSET_KEY, getDateOffset } from '../../domain/verifyTools';

type Props = {
  testPaymentCount: number;
  onResetPeriod: () => void;
  onAddTestPayments: (date: string) => void;
  onRemoveTestPayments: () => void;
};

const koreaDay = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);
const label = (date: string) => { const [, month, day] = date.split('-').map(Number); return `${month}월 ${day}일`; };

/** Verification build only: moves "today" and sets up period states for the device checklist. */
export function VerifyToolsPanel(props: Props) {
  const today = koreaDay(Date.now());
  const [target, setTarget] = useState(today);
  const [paymentDate, setPaymentDate] = useState(today);
  const shifted = (() => { try { return Number(window.localStorage.getItem(VERIFY_DATE_OFFSET_KEY)) || 0; } catch { return 0; } })();
  const setOffset = (offset: number) => {
    try {
      if (offset) window.localStorage.setItem(VERIFY_DATE_OFFSET_KEY, String(offset));
      else window.localStorage.removeItem(VERIFY_DATE_OFFSET_KEY);
    } catch { return; }
    window.location.reload();
  };
  return <section className="verify-tools">
    <p>검증 앱에서만 보이는 도구입니다. Play 배포본에는 없습니다.</p>
    <h3>오늘 날짜 바꾸기</h3>
    <p>앱이 쓰는 오늘: <strong>{label(today)}</strong>{shifted ? ' (바꾼 날짜)' : ' (실제 날짜)'}</p>
    <label>바꿀 날짜<input type="date" aria-label="바꿀 날짜" value={target} onChange={(event) => setTarget(event.target.value)} /></label>
    <button className="sheet-action" type="button" disabled={!target} onClick={() => setOffset(getDateOffset(target, Date.now() - shifted))}>이 날짜로 바꾸기</button>
    {shifted !== 0 && <button className="sheet-action secondary-action" type="button" onClick={() => setOffset(0)}>실제 날짜로 돌아가기</button>}
    <small>앱을 다시 불러옵니다. 결제 알림 시각과 앱을 닫았을 때의 경고는 실제 날짜 기준입니다.</small>
    <h3>이번 기간 상태 초기화</h3>
    <p>이번 기간 계획과 입금 상태만 지웁니다. 입금 전 결제로 빠졌던 결제는 원래 상태로 돌아가고, 결제 기록은 남습니다. 지난 기간 계획이 없으면 온보딩부터 다시 시작합니다.</p>
    <button className="sheet-action secondary-action" type="button" onClick={props.onResetPeriod}>이번 기간 상태 초기화</button>
    <h3>테스트 결제 넣기</h3>
    <p>고른 날짜의 09:00, 13:00, 18:00에 5,000원 식비 결제 3건을 넣습니다.</p>
    <label>결제 날짜<input type="date" aria-label="테스트 결제 날짜" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label>
    <button className="sheet-action" type="button" disabled={!paymentDate} onClick={() => props.onAddTestPayments(paymentDate)}>테스트 결제 3건 넣기</button>
    <button className="sheet-action secondary-action" type="button" disabled={!props.testPaymentCount} onClick={props.onRemoveTestPayments}>테스트 결제 지우기 ({props.testPaymentCount}건)</button>
  </section>;
}
