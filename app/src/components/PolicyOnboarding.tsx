import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SUPPORT_PROFILE_ID, SHINHANHAE_PROFILES, emptyPolicy, getAlertTargets, validatePolicyAgainstProfile, type SupportPolicy, type SupportProfileId } from '../domain/policy';
import { PlanEditor } from '../features/policy/PlanEditor';
import { usePolicyDraft } from '../features/policy/usePolicyDraft';

/** The first plan, read and corrected with the same editor as a new period's plan. */
export function PolicyOnboarding({ onConfirm, initialDraft = null, onDraftChange }: { onConfirm: (policy: SupportPolicy) => void; initialDraft?: SupportPolicy | null; onDraftChange?: (policy: SupportPolicy | null) => void }) {
  const [profileId, setProfileId] = useState<SupportProfileId>(initialDraft?.profileId ?? DEFAULT_SUPPORT_PROFILE_ID);
  const [message, setMessage] = useState<string | null>(null);
  const plan = usePolicyDraft({ ...emptyPolicy, profileId }, setMessage, initialDraft);
  const draft = plan.draft;
  // The draft is kept with the onboarding progress so an interruption resumes it.
  const reported = useRef(draft);
  useEffect(() => {
    if (reported.current === draft) return;
    reported.current = draft;
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);
  const selected = draft?.profileId ?? profileId;
  const applyProfile = (nextId: SupportProfileId) => { setProfileId(nextId); plan.updateProfile(nextId); };
  const confirm = () => {
    if (!draft) return;
    const issues = validatePolicyAgainstProfile(draft);
    if (issues.length) { setMessage(issues[0]); return; }
    onConfirm({ ...draft, alertTargets: getAlertTargets(draft), sourceText: plan.text || draft.sourceText });
  };
  return (
    <main className="first-run">
      <div className="first-run__mark">지원금 관리 · 2단계</div>
      <h1>사용 계획을<br />확정해 주세요</h1>
      <p>이번 달 배정 지원금을 선택한 뒤 계획표를 불러와 주세요.</p>
      <section className="support-profile-picker" aria-label="신청해 지원 유형 선택">{SHINHANHAE_PROFILES.map((candidate) => <button type="button" key={candidate.id} className={selected === candidate.id ? 'is-selected' : ''} onClick={() => applyProfile(candidate.id)}><strong>{candidate.label}</strong><span>정주비 {candidate.bucketLimits.resident.toLocaleString()}원 · 학습공간비 {candidate.bucketLimits.studySpace.toLocaleString()}원</span></button>)}</section>
      <section className="first-run__card">
        <img className="onboarding-policy-example" src="/onboarding-policy-example.png" alt="정주비와 학습공간비의 사용처별 예상금액이 담긴 계획표 예시" />
        <PlanEditor text={plan.text} draft={draft} focusToken={plan.focusToken} submitLabel="다음" onTextChange={plan.setText} onReviewText={plan.reviewText} onReadScreenshot={() => void plan.readScreenshot()} onUpdateAmount={plan.updateAmount} onUpdateProfile={applyProfile} onToggleAlertTarget={plan.toggleAlertTarget} onAddCustomItem={plan.addCustomItem} onRemoveCustomItem={plan.removeCustomItem} onSubmit={confirm} />
      </section>
      {message && <p role="alert" className="first-run__error">{message}</p>}
      <section className="first-run__notice">
        <strong>자동 기록 시작 시점</strong>
        <span>정책 확정 전 승인 알림은 임시 보관됩니다. 정책 확정 후 분류 필요 목록으로 불러오거나 삭제할 수 있으며, 분류 전까지 사용액과 예산 경고에는 포함되지 않습니다.</span>
      </section>
    </main>
  );
}
