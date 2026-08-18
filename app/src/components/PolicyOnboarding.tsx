import { useState } from 'react';
import { PolicyOcr } from '../native/policyOcr';
import { POLICY_ITEMS, getPolicyLimit, parsePolicyText, type PolicyItem, type SupportPolicy } from '../domain/policy';
import { POLICY_MAX_LIMITS } from '../domain/budget';

function createBlankPolicy(): SupportPolicy {
  return { plans: { housing: 0, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 0, readingRoom: 0 }, sourceText: '' };
}

export function PolicyOnboarding({ onConfirm }: { onConfirm: (policy: SupportPolicy) => void }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SupportPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const readImage = async () => { try { const result = await PolicyOcr.pickAndRecognize(); if (!result.text.trim()) { setText(''); setDraft(createBlankPolicy()); setMessage('이미지에서 금액을 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.'); return; } setText(result.text); setDraft(parsePolicyText(result.text)); setMessage('OCR 결과를 확인하고 필요한 금액만 수정해 주세요.'); } catch { setText(''); setDraft(createBlankPolicy()); setMessage('이미지를 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.'); } };
  const update = (item: PolicyItem, value: string) => { const amount = Number(value.replaceAll(',', '')); if (!Number.isFinite(amount) || amount < 0) return; setDraft((current) => current ? { ...current, plans: { ...current.plans, [item]: Math.floor(amount) } } : current); };
  const confirm = () => { if (!draft) return; const resident = getPolicyLimit(draft, 'resident'); const study = getPolicyLimit(draft, 'studySpace'); if (resident !== POLICY_MAX_LIMITS.resident || study !== POLICY_MAX_LIMITS.studySpace) { setMessage(`정주비는 ${POLICY_MAX_LIMITS.resident.toLocaleString()}원, 학습공간비는 ${POLICY_MAX_LIMITS.studySpace.toLocaleString()}원으로 항목 합계를 맞춰 주세요.`); return; } onConfirm({ ...draft, sourceText: text || draft.sourceText }); };
  return <main className="first-run"><div className="first-run__mark">지원금 관리 · 2/3</div><h1>사용 계획을<br />확정해 주세요</h1><p>계획표 이미지를 올리면 항목별 금액을 읽어 드립니다. 인식 결과는 확인 후 수정해 주세요.</p><section className="first-run__card"><button className="first-run__start" type="button" onClick={() => void readImage()}>이미지로 계획표 불러오기</button>{draft && <div className="onboarding-policy"><strong>정책 검토</strong><p>인식된 금액이 잘못되었다면 아래 테이블에서 직접 수정하세요.</p>{POLICY_ITEMS.map((item) => <label key={item.key}>{item.label}<input aria-label={`온보딩 ${item.label} 금액`} type="number" min="0" step="1000" value={draft.plans[item.key]} onChange={(event) => update(item.key, event.target.value)} /></label>)}<p>정주비 {getPolicyLimit(draft, 'resident').toLocaleString()}원 / 학습공간비 {getPolicyLimit(draft, 'studySpace').toLocaleString()}원</p><button className="first-run__start" type="button" onClick={confirm}>정책 확정</button></div>}</section>{message && <p role="alert" className="first-run__error">{message}</p>}<section className="first-run__notice"><strong>자동 기록 시작 시점</strong><span>정책 확정 전 승인 문자는 임시 보관됩니다. 정책 확정 후 미정 지출로 불러오거나 삭제할 수 있으며, 분류 전까지 사용액과 예산 경고에는 포함되지 않습니다.</span></section></main>;
}
