import { useState } from 'react';
import { FirstRunPermission } from './FirstRunPermission';
import { PolicyOnboarding } from './PolicyOnboarding';
import { SmsBridge, type NativeApproval } from '../native/smsBridge';
import type { SupportPolicy } from '../domain/policy';

type HistoryAction = 'keep-undecided' | 'discard';

type CompletePayload = {
  cardLast4: string;
  policy: SupportPolicy;
  pendingApprovals: NativeApproval[];
  historyAction: HistoryAction;
};

export function OnboardingFlow({ onComplete }: { onComplete: (payload: CompletePayload) => void }) {
  const [step, setStep] = useState<'permissions' | 'policy' | 'history'>('permissions');
  const [cardLast4, setCardLast4] = useState('');
  const [policy, setPolicy] = useState<SupportPolicy | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<NativeApproval[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const continueAfterPermissions = async (card: string) => {
    try {
      await SmsBridge.configure({ cardLast4: card });
      setCardLast4(card);
      setStep('policy');
    } catch {
      setMessage('카드 설정을 완료할 수 없습니다. 앱을 다시 실행해 주세요.');
    }
  };

  const continueAfterPolicy = async (confirmedPolicy: SupportPolicy) => {
    setPolicy(confirmedPolicy);
    try {
      const result = await SmsBridge.consumePendingApprovals();
      setPendingApprovals(result.items);
    } catch {
      setPendingApprovals([]);
    }
    setStep('history');
  };

  if (step === 'permissions') return <FirstRunPermission onComplete={(card) => { void continueAfterPermissions(card); }} />;
  if (step === 'policy') return <><PolicyOnboarding onConfirm={(confirmedPolicy) => { void continueAfterPolicy(confirmedPolicy); }} />{message && <p className="onboarding-error" role="alert">{message}</p>}</>;
  if (!policy) return null;

  return <main className="first-run">
    <div className="first-run__mark">지원금 관리 · 3/3</div>
    <h1>기존 결제내역이<br />있나요?</h1>
    <p>정책을 확정하기 전에 수신된 승인 문자는 예산에 반영하지 않았습니다.</p>
    <section className="first-run__card">
      <strong>정책 확정 전 승인 {pendingApprovals.length}건</strong>
      <p>불러오면 모두 미정 지출로 저장됩니다. 직접 항목을 정하기 전까지 사용액과 예산 경고에는 포함되지 않습니다.</p>
    </section>
    {pendingApprovals.length > 0 && <section className="first-run__notice"><strong>카드가 잘못 설정되었나요?</strong><span>이 결제내역은 삭제하고, 이후 카드사 또는 은행 파일에서 다시 가져올 수 있습니다.</span></section>}
    <button className="first-run__start" type="button" onClick={() => onComplete({ cardLast4, policy, pendingApprovals, historyAction: 'keep-undecided' })}>{pendingApprovals.length ? '미정 지출로 불러오기' : '지원금 관리 시작'}</button>
    {pendingApprovals.length > 0 && <button className="onboarding-secondary" type="button" onClick={() => onComplete({ cardLast4, policy, pendingApprovals, historyAction: 'discard' })}>이 결제내역 삭제하기</button>}
  </main>;
}