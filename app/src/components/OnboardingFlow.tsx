import { useState } from 'react';
import { FirstRunPermission } from './FirstRunPermission';
import { PolicyOnboarding } from './PolicyOnboarding';
import { SmsBridge, type NativeApproval } from '../native/smsBridge';
import type { SupportPolicy } from '../domain/policy';

type HistoryAction = 'keep-undecided' | 'discard';
type NextAction = 'dashboard' | 'import';
type CompletePayload = { cardLast4: string; policy: SupportPolicy; pendingApprovals: NativeApproval[]; historyAction: HistoryAction; nextAction: NextAction };

export function OnboardingFlow({ onComplete }: { onComplete: (payload: CompletePayload) => void }) {
  const [step, setStep] = useState<'permissions' | 'policy' | 'history'>('permissions');
  const [cardLast4, setCardLast4] = useState('');
  const [policy, setPolicy] = useState<SupportPolicy | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<NativeApproval[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const continueAfterPermissions = async (card: string) => {
    try { await SmsBridge.configure({ cardLast4: card }); setCardLast4(card); setStep('policy'); }
    catch { setMessage('카드 설정을 완료할 수 없습니다. 권한을 다시 확인해 주세요.'); }
  };
  const continueAfterPolicy = async (confirmedPolicy: SupportPolicy) => {
    setPolicy(confirmedPolicy);
    try { setPendingApprovals((await SmsBridge.consumePendingApprovals()).items); } catch { setPendingApprovals([]); }
    setStep('history');
  };
  const complete = (nextAction: NextAction, historyAction: HistoryAction = 'keep-undecided') => {
    if (policy) onComplete({ cardLast4, policy, pendingApprovals, historyAction, nextAction });
  };

  if (step === 'permissions') return <FirstRunPermission onComplete={(card) => { void continueAfterPermissions(card); }} />;
  if (step === 'policy') return <><PolicyOnboarding onConfirm={(confirmedPolicy) => { void continueAfterPolicy(confirmedPolicy); }} />{message && <p className="onboarding-error" role="alert">{message}</p>}</>;
  if (!policy) return null;

  return <main className="first-run">
    <div className="first-run__mark">지원금 관리 · 3/3</div>
    <h1>결제 내역이<br />이미 있나요?</h1>
    <p>정책을 확정했습니다. 신한카드 이용내역을 가져오거나, 바로 지원금 관리를 시작할 수 있습니다.</p>
    {pendingApprovals.length > 0 && <section className="first-run__notice"><strong>정책 확정 전 승인 알림 {pendingApprovals.length}건</strong><span>불러오면 모두 미정 지출로 보관되며, 직접 분류하기 전까지 예산과 경고에는 반영되지 않습니다.</span></section>}
    <section className="first-run__card onboarding-choice">
      <strong>아직 사용 전이에요</strong><p>빈 상태의 대시보드에서 새 지출을 직접 등록할 수 있습니다.</p>
      <button className="first-run__start" type="button" onClick={() => complete('dashboard')}>지원금 관리 시작</button>
    </section>
    <section className="first-run__card onboarding-choice">
      <strong>결제한 적이 있어요</strong><p>신한카드에서 카드 하나만 선택해 받은 엑셀을 가져옵니다.</p>
      <button className="onboarding-secondary" type="button" onClick={() => complete('import')}>거래내역 등록하기</button>
    </section>
    <button className="guide-toggle" type="button" onClick={() => setShowGuide((current) => !current)}>거래내역 등록 가이드 {showGuide ? '닫기' : '보기'}</button>
    {showGuide && <section className="onboarding-guide"><strong>가져오는 방법</strong><ol><li>신한카드 앱에서 사용할 카드 하나를 선택합니다.</li><li>해당 카드의 이용내역을 엑셀로 내려받습니다.</li><li>이 화면에서 엑셀 파일을 선택해 내용을 확인합니다.</li></ol><p>앞 3자리가 같은 카드가 파일 안에 둘 이상이면 안전을 위해 가져오지 않습니다.</p></section>}
  </main>;
}
