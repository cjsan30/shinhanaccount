import { useState } from 'react';
import { PolicyOcr } from '../native/policyOcr';
import { POLICY_ITEMS, getPolicyLimit, parsePolicyText, type PolicyItem, type SupportPolicy } from '../domain/policy';

const MAX_RESIDENT = 500_000;
const MAX_STUDY = 200_000;

function createBlankPolicy(): SupportPolicy {
  return { plans: { housing: 0, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 0, readingRoom: 0 }, sourceText: '' };
}

export function PolicyOnboarding({ onConfirm }: { onConfirm: (policy: SupportPolicy) => void }) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SupportPolicy | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const review = () => { if (!text.trim()) { setMessage('계획표 텍스트를 붙여넣거나 직접 입력을 시작해 주세요.'); return; } setDraft(parsePolicyText(text)); setMessage('인식 결과를 확인하고 필요한 금액을 수정해 주세요.'); };
  const readImage = async () => { try { const result = await PolicyOcr.pickAndRecognize(); if (!result.text.trim()) { setMessage('사진에서 읽을 수 있는 텍스트가 없습니다.'); return; } setText(result.text); setDraft(parsePolicyText(result.text)); setMessage('OCR 결과는 반드시 항목별 금액을 확인해 주세요.'); } catch { setMessage('사진 선택 또는 인식을 취소했습니다.'); } };
  const update = (item: PolicyItem, value: string) => { const amount = Number(value.replaceAll(',', '')); if (!Number.isFinite(amount) || amount < 0) return; setDraft((current) => current ? { ...current, plans: { ...current.plans, [item]: Math.floor(amount) } } : current); };
  const confirm = () => { if (!draft) return; const resident = getPolicyLimit(draft, 'resident'); const study = getPolicyLimit(draft, 'studySpace'); if (resident !== MAX_RESIDENT || study !== MAX_STUDY) { setMessage(`정주비는 ${MAX_RESIDENT.toLocaleString()}원, 학습공간비는 ${MAX_STUDY.toLocaleString()}원으로 항목 합계를 맞춰 주세요.`); return; } onConfirm({ ...draft, sourceText: text || draft.sourceText }); };
  return <main className="first-run"><div className="first-run__mark">지원금 관리 · 2/3</div><h1>사용 계획을<br />확정해 주세요</h1><p>기본 예산은 자동으로 만들지 않습니다. 실제 신청 계획을 확인한 뒤에만 새 결제를 자동 기록합니다.</p><section className="first-run__card"><label>계획표 텍스트<textarea aria-label="온보딩 계획표 내용" value={text} onChange={(event) => setText(event.target.value)} placeholder="모바일 웹에서 표를 복사해 붙여넣으세요." /></label><div className="onboarding-actions"><button type="button" onClick={review}>텍스트 읽기</button><button type="button" onClick={() => void readImage()}>스크린샷 OCR (보조)</button><button type="button" onClick={() => setDraft(createBlankPolicy())}>직접 항목 입력</button></div>{draft && <div className="onboarding-policy"><strong>정책 검토</strong>{POLICY_ITEMS.map((item) => <label key={item.key}>{item.label}<input aria-label={`온보딩 ${item.label} 금액`} type="number" min="0" step="1000" value={draft.plans[item.key]} onChange={(event) => update(item.key, event.target.value)} /></label>)}<p>정주비 {getPolicyLimit(draft, 'resident').toLocaleString()}원 / 학습공간비 {getPolicyLimit(draft, 'studySpace').toLocaleString()}원</p><button className="first-run__start" type="button" onClick={confirm}>정책 확정</button></div>}</section>{message && <p role="alert" className="first-run__error">{message}</p>}<section className="first-run__notice"><strong>자동 기록 시작 시점</strong><span>정책 확정 전의 SMS는 저장하거나 분류하지 않습니다.</span></section></main>;
}
