import { useEffect, useRef, useState } from 'react';
import { PolicyOcr } from '../native/policyOcr';
import { DEFAULT_SUPPORT_PROFILE_ID, POLICY_ITEMS, SHINHANHAE_PROFILES, getAlertTargets, getPolicyLimit, getSupportProfile, parsePolicyText, validatePolicyAgainstProfile, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../domain/policy';

function createBlankPolicy(): SupportPolicy {
  return { plans: { housing: 0, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 0, readingRoom: 0 }, sourceText: '', profileId: DEFAULT_SUPPORT_PROFILE_ID, alertTargets: [] };
}

export function PolicyOnboarding({ onConfirm }: { onConfirm: (policy: SupportPolicy) => void }) {
  const [profileId, setProfileId] = useState<SupportProfileId>(DEFAULT_SUPPORT_PROFILE_ID);
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SupportPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);
  const scrollAfterRead = useRef(false);
  useEffect(() => {
    if (!draft || !scrollAfterRead.current) return;
    scrollAfterRead.current = false;
    requestAnimationFrame(() => draftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [draft]);
  const profile = getSupportProfile(profileId);
  const applyProfile = (nextId: SupportProfileId) => { setProfileId(nextId); setDraft((current) => current ? { ...current, profileId: nextId } : current); };
  const readImage = async () => { try { const result = await PolicyOcr.pickAndRecognize(); scrollAfterRead.current = true; if (!result.text.trim()) { setText(''); setDraft({ ...createBlankPolicy(), profileId }); setMessage('이미지에서 금액을 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.'); return; } setText(result.text); setDraft({ ...parsePolicyText(result.text), profileId }); setMessage('OCR 결과를 확인하고 필요한 금액만 수정해 주세요.'); } catch { scrollAfterRead.current = true; setText(''); setDraft({ ...createBlankPolicy(), profileId }); setMessage('이미지를 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.'); } };
  const update = (item: PolicyItem, value: string) => { const amount = Number(value.replaceAll(',', '')); if (!Number.isFinite(amount) || amount < 0) return; setDraft((current) => current ? { ...current, plans: { ...current.plans, [item]: Math.floor(amount) } } : current); };
  const toggleAlertTarget = (item: PolicyItem) => setDraft((current) => current ? { ...current, alertTargets: getAlertTargets(current).includes(item) ? getAlertTargets(current).filter((target) => target !== item) : [...getAlertTargets(current), item] } : current);
  const confirm = () => { if (!draft) return; const issues = validatePolicyAgainstProfile({ ...draft, profileId }); if (issues.length) { setMessage(issues[0]); return; } onConfirm({ ...draft, profileId, alertTargets: getAlertTargets(draft), sourceText: text || draft.sourceText }); };
  const policyGroups = [
    { key: 'resident', label: '정주비', limit: profile.bucketLimits.resident, items: POLICY_ITEMS.filter((item) => item.bucket === 'resident') },
    { key: 'study', label: '학습공간비', limit: profile.bucketLimits.studySpace, items: POLICY_ITEMS.filter((item) => item.bucket === 'studySpace') },
  ] as const;
  return (
    <main className="first-run">
      <div className="first-run__mark">지원금 관리 · 2단계</div>
      <h1>사용 계획을<br />확정해 주세요</h1>
      <p>이번 달 배정 지원금을 선택한 뒤 계획표를 불러와 주세요.</p>
      <section className="support-profile-picker" aria-label="신청해 지원 유형 선택">{SHINHANHAE_PROFILES.map((candidate) => <button type="button" key={candidate.id} className={profileId === candidate.id ? 'is-selected' : ''} onClick={() => applyProfile(candidate.id)}><strong>{candidate.label}</strong><span>정주비 {candidate.bucketLimits.resident.toLocaleString()}원 · 학습공간비 {candidate.bucketLimits.studySpace.toLocaleString()}원</span></button>)}</section>
      <p className="support-profile-note">선택한 유형의 총액과 세부항목 상한에 맞춰 계획표를 검토합니다.</p>
      <section className="first-run__card">
        <img className="onboarding-policy-example" src="/onboarding-policy-example.png" alt="정주비와 학습공간비의 사용처별 예상금액이 담긴 계획표 예시" />
        <button className="first-run__start" type="button" onClick={() => void readImage()}>이미지로 계획표 불러오기</button>
        {draft && (
          <div className="onboarding-policy" ref={draftRef}>
            <div className="onboarding-policy__heading"><strong>읽은 계획 금액</strong><span>필요한 항목만 수정하세요</span></div>
            <div className="onboarding-policy__groups">
              {policyGroups.map((group) => (
                <section className="onboarding-policy__group" key={group.key}>
                  <header><strong>{group.label}</strong><span>{getPolicyLimit(draft, group.key === 'resident' ? 'resident' : 'studySpace').toLocaleString()} / {group.limit.toLocaleString()}원</span></header>
                  {group.items.map((item) => (
                    <label key={item.key}>
                      <span>{item.label}<small>최대 {profile.itemCaps[item.key].toLocaleString()}원</small></span>
                      <div><input aria-label={`온보딩 ${item.label} 금액`} type="number" min="0" step="1000" value={draft.plans[item.key]} onChange={(event) => update(item.key, event.target.value)} /><em>원</em></div>
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <section className="policy-alert-targets"><strong>잔액 경고를 받을 항목</strong><span>선택한 항목만 공통 경고 기준에 따라 알려드립니다.</span>{POLICY_ITEMS.filter((item) => draft.plans[item.key] > 0).map((item) => <label key={item.key}><input type="checkbox" checked={getAlertTargets(draft).includes(item.key)} onChange={() => toggleAlertTarget(item.key)} /> {item.label}</label>)}</section>
            <button className="first-run__start" type="button" onClick={confirm}>정책 확정</button>
          </div>
        )}
      </section>
      {message && <p role="alert" className="first-run__error">{message}</p>}
      <section className="first-run__notice">
        <strong>자동 기록 시작 시점</strong>
        <span>정책 확정 전 승인 알림은 임시 보관됩니다. 정책 확정 후 미정 지출로 불러오거나 삭제할 수 있으며, 분류 전까지 사용액과 예산 경고에는 포함되지 않습니다.</span>
      </section>
    </main>
  );
}
