import { useState } from 'react';
import { normalizePolicyPeriod, type PolicyPeriod } from '../../domain/budget';
import { getAlertTargets, parsePolicyText, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../../domain/policy';
import { PolicyOcr } from '../../native/policyOcr';

/**
 * The plan being reviewed before it is confirmed: pasted or OCR text, the parsed
 * draft and a token that asks the data panel to scroll the draft into view.
 * Confirming and persisting stay with the caller, which owns the policy book.
 */
export function usePolicyDraft(basePolicy: SupportPolicy, notify: (message: string) => void) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SupportPolicy | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const focusDraft = () => setFocusToken((current) => current + 1);
  // A parsed plan keeps the saved period, profile and alert choices until the user changes them.
  const draftFromText = (value: string): SupportPolicy => ({ ...parsePolicyText(value), period: normalizePolicyPeriod(basePolicy.period), profileId: basePolicy.profileId, alertTargets: getAlertTargets(basePolicy) });

  const reviewText = () => {
    if (!text.trim()) { notify('계획표 내용을 붙여넣어 주세요.'); return; }
    setDraft(draftFromText(text));
    focusDraft();
  };
  const readScreenshot = async () => {
    try {
      const result = await PolicyOcr.pickAndRecognize();
      if (!result.text.trim()) { notify('사진에서 읽을 수 있는 텍스트가 없습니다.'); return; }
      setText(result.text);
      setDraft(draftFromText(result.text));
      focusDraft();
      notify('스크린샷의 텍스트를 읽었습니다. 검토 후 확정해 주세요.');
    } catch {
      notify('사진 선택 또는 텍스트 인식을 취소했습니다.');
    }
  };
  const editSaved = () => { setDraft(structuredClone(basePolicy)); focusDraft(); };
  const updateAmount = (item: PolicyItem, value: string) => {
    const amount = Number(value.replaceAll(',', ''));
    if (!Number.isFinite(amount) || amount < 0) return;
    setDraft((current) => current ? { ...current, plans: { ...current.plans, [item]: Math.floor(amount) } } : current);
  };
  const updateProfile = (profileId: SupportProfileId) => setDraft((current) => current ? { ...current, profileId } : current);
  const updatePeriod = (period: PolicyPeriod) => setDraft((current) => current ? { ...current, period } : current);
  const toggleAlertTarget = (item: PolicyItem) => setDraft((current) => current ? { ...current, alertTargets: getAlertTargets(current).includes(item) ? getAlertTargets(current).filter((target) => target !== item) : [...getAlertTargets(current), item] } : current);
  const clearDraft = () => setDraft(null);
  const clear = () => { setText(''); setDraft(null); };

  return { text, setText, draft, focusToken, reviewText, readScreenshot, editSaved, updateAmount, updateProfile, updatePeriod, toggleAlertTarget, clearDraft, clear };
}
