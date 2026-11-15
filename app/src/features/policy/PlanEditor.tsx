import { useEffect, useRef } from 'react';
import { SHINHANHAE_PROFILES, getAlertTargets, getPolicyLimit, getSupportProfile, POLICY_ITEMS, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../../domain/policy';

type Props = {
  text: string;
  draft: SupportPolicy | null;
  /** Changes only when a plan was just read, so typing an amount never scrolls the sheet. */
  focusToken: number;
  submitLabel: string;
  onTextChange: (value: string) => void;
  onReviewText: () => void;
  onReadScreenshot: () => void;
  onUpdateAmount: (item: PolicyItem, value: string) => void;
  onUpdateProfile: (profileId: SupportProfileId) => void;
  onToggleAlertTarget: (item: PolicyItem) => void;
  onSubmit: () => void;
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

/** Reads a plan from pasted text or a screenshot and lets the user correct the amounts. */
export function PlanEditor(props: Props) {
  const draftRef = useRef<HTMLDivElement>(null);
  const { focusToken } = props;
  useEffect(() => {
    if (!focusToken) return;
    requestAnimationFrame(() => draftRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }, [focusToken]);
  const draft = props.draft;
  return <div className="policy-card plan-editor">
    <p>정주비는 식비·교육비·교통비·주거비, 학습공간비는 카페·스터디카페·독서실입니다.</p>
    <p>모바일 웹에서 계획표를 복사해 붙여넣으세요. 자동 확정하지 않으며, 아래 결과를 검토한 뒤 적용합니다.</p>
    <textarea aria-label="계획표 내용" value={props.text} onChange={(event) => props.onTextChange(event.target.value)} placeholder="예: 식비 200000원 교육비 160000원 교통비 140000원 카페 200000원" />
    <button className="sheet-action" onClick={props.onReviewText}>계획표 읽기</button>
    <button className="sheet-action secondary-action" onClick={props.onReadScreenshot}>스크린샷에서 읽기</button>
    {draft && <div className="policy-preview" ref={draftRef}>
      <strong>검토 결과</strong>
      <label>지원 유형<select aria-label="정책 지원 유형" value={draft.profileId} onChange={(event) => props.onUpdateProfile(event.target.value as SupportProfileId)}>{SHINHANHAE_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label>
      <div className="policy-lines">
        {(['resident', 'studySpace'] as const).map((bucket) => <section className="policy-group" key={bucket}>
          <h4>{bucket === 'resident' ? '정주비' : '학습공간비'} <span>{won(getPolicyLimit(draft, bucket))} / {won(getSupportProfile(draft.profileId).bucketLimits[bucket])}</span></h4>
          {POLICY_ITEMS.filter((item) => item.bucket === bucket).map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={draft.plans[item.key] ?? 0} onChange={(event) => props.onUpdateAmount(item.key, event.target.value)} /></label>)}
        </section>)}
        <strong>총 한도 {won(getPolicyLimit(draft, 'resident') + getPolicyLimit(draft, 'studySpace'))} / {won(getSupportProfile(draft.profileId).totalLimit)}</strong>
      </div>
      <section className="policy-alert-targets policy-alert-targets--review"><strong>잔액 경고 대상</strong><span>선택한 항목만 공통 경고 기준에 따라 알려드립니다.</span>{POLICY_ITEMS.filter((item) => draft.plans[item.key] > 0).map((item) => <label key={item.key}><input type="checkbox" checked={getAlertTargets(draft).includes(item.key)} onChange={() => props.onToggleAlertTarget(item.key)} /><b>{item.label}</b><small>{won(draft.plans[item.key])}</small></label>)}</section>
      <button className="sheet-action" onClick={props.onSubmit}>{props.submitLabel}</button>
    </div>}
  </div>;
}
