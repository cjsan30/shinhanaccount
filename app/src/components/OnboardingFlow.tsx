import { useState } from 'react';
import { FirstRunPermission } from './FirstRunPermission';
import { PolicyOnboarding } from './PolicyOnboarding';
import { SmsBridge, type NativeApproval } from '../native/smsBridge';
import type { SupportPolicy } from '../domain/policy';

type HistoryAction = 'keep-undecided' | 'discard';
type NextAction = 'dashboard' | 'import';
type ApplicantStatus = 'applicant' | 'not-applicant';

type CompletePayload = {
  applicantStatus: ApplicantStatus;
  cardLast4: string;
  policy: SupportPolicy | null;
  pendingApprovals: NativeApproval[];
  historyAction: HistoryAction;
  nextAction: NextAction;
};

export function OnboardingFlow({ onComplete }: { onComplete: (payload: CompletePayload) => void }) {
  const [step, setStep] = useState<'applicant' | 'permissions' | 'policy' | 'history'>('applicant');
  const [cardLast4, setCardLast4] = useState('');
  const [policy, setPolicy] = useState<SupportPolicy | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<NativeApproval[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const skipToDashboard = (messageOverride?: string) => {
    onComplete({
      applicantStatus: 'not-applicant',
      cardLast4: '',
      policy: null,
      pendingApprovals: [],
      historyAction: 'discard',
      nextAction: 'dashboard',
    });
    if (messageOverride) {
      setMessage(messageOverride);
    }
  };

  const continueAfterPermissions = async (card: string) => {
    try {
      await SmsBridge.configure({ cardLast4: card });
      setCardLast4(card);
      setStep('policy');
    } catch {
      setMessage('카드 설정을 완료할 수 없습니다. 권한을 다시 확인해 주세요.');
    }
  };

  const continueAfterPolicy = async (confirmedPolicy: SupportPolicy) => {
    setPolicy(confirmedPolicy);
    try {
      setPendingApprovals((await SmsBridge.consumePendingApprovals()).items);
    } catch {
      setPendingApprovals([]);
    }
    setStep('history');
  };

  const complete = (nextAction: NextAction, historyAction: HistoryAction = 'keep-undecided') => {
    if (!policy) {
      return;
    }
    onComplete({
      applicantStatus: 'applicant',
      cardLast4,
      policy,
      pendingApprovals,
      historyAction,
      nextAction,
    });
  };

  if (step === 'applicant') {
    return (
      <main className="first-run">
        <section className="applicant-question" aria-label="신청해 사업 지원자 여부">
          <h1>신청해 사업<br />지원자인가요?</h1>
          <div>
            <button className="first-run__start" type="button" onClick={() => setStep('policy')}>Yes</button>
            <button className="onboarding-secondary" type="button" onClick={() => skipToDashboard()}>No</button>
          </div>
        </section>
      </main>
    );
  }

  if (step === 'permissions') {
    return (
      <FirstRunPermission
        onComplete={(card) => {
          void continueAfterPermissions(card);
        }}
        onSkip={() => skipToDashboard('지원자 온보딩을 건너뛰고 대시보드로 이동합니다.')}
      />
    );
  }

  if (step === 'policy') {
    return (
      <>
        <PolicyOnboarding onConfirm={(confirmedPolicy) => { void continueAfterPolicy(confirmedPolicy); }} />
        <button className="guide-toggle" type="button" onClick={() => skipToDashboard('지원자 온보딩을 건너뛰고 대시보드로 이동합니다.')}>
          넘어가기
        </button>
        {message && <p className="onboarding-error" role="alert">{message}</p>}
      </>
    );
  }

  if (!policy) return null;

  return (
    <main className="first-run">
      <div className="first-run__mark">지원금 관리 · 3단계</div>
      <h1>결제 내역이<br />이미 있나요?</h1>
      <p>정책을 확정했습니다. 신한카드 이용내역을 가져오거나, 바로 지원금 관리를 시작할 수 있습니다.</p>
      {pendingApprovals.length > 0 && (
        <section className="first-run__notice">
          <strong>정책 확정 전 승인 알림 {pendingApprovals.length}건</strong>
          <span>불러오면 모두 미정 지출로 보관되며, 직접 분류하기 전까지 예산과 경고에는 반영되지 않습니다.</span>
        </section>
      )}
      <section className="onboarding-decision-list" aria-label="결제내역 등록 여부 선택">
        <button className="onboarding-decision onboarding-decision--empty" type="button" onClick={() => complete('dashboard')}>
          <strong>아직 사용 전이에요</strong>
          <span>지원금 관리를 시작하고, 결제할 때마다 직접 등록하거나 자동으로 기록할게요.</span>
          <b>지원금 관리 시작</b>
        </button>
        <button className="onboarding-decision onboarding-decision--history" type="button" onClick={() => complete('import')}>
          <strong>결제한 적이 있어요</strong>
          <span>신한 SOL Pay에서 받은 엑셀을 가져와 기존 결제 내역을 등록할게요.</span>
          <b>거래내역 등록하기</b>
        </button>
      </section>
    </main>
  );
}
