import { useState } from 'react';
import { emptyPolicy, getAlertTargets, parsePolicyText, type CustomPolicyItem, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../../domain/policy';
import { PolicyOcr } from '../../native/policyOcr';

/**
 * The plan being reviewed before it is confirmed: pasted or OCR text, the parsed
 * draft and a token that asks the data panel to scroll the draft into view.
 * Confirming and persisting stay with the caller, which owns the policy book.
 */
export function usePolicyDraft(basePolicy: SupportPolicy, notify: (message: string) => void, initialDraft: SupportPolicy | null = null) {
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SupportPolicy | null>(initialDraft);
  const [focusToken, setFocusToken] = useState(0);
  const focusDraft = () => setFocusToken((current) => current + 1);
  // A parsed plan keeps the saved profile and alert choices until the user changes them.
  const draftFromText = (value: string): SupportPolicy => ({ ...parsePolicyText(value), profileId: basePolicy.profileId, alertTargets: getAlertTargets(basePolicy) });

  // An unreadable image still opens the amounts so the user can type them.
  const blankDraft = (): SupportPolicy => ({ ...structuredClone(emptyPolicy), profileId: basePolicy.profileId, alertTargets: [] });

  const reviewText = () => {
    if (!text.trim()) { notify('계획표 내용을 붙여넣어 주세요.'); return; }
    setDraft(draftFromText(text));
    focusDraft();
  };
  const readScreenshot = async () => {
    try {
      const result = await PolicyOcr.pickAndRecognize();
      if (!result.text.trim()) { setText(''); setDraft(blankDraft()); focusDraft(); notify('이미지에서 금액을 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.'); return; }
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
  const toggleAlertTarget = (item: PolicyItem) => setDraft((current) => current ? { ...current, alertTargets: getAlertTargets(current).includes(item) ? getAlertTargets(current).filter((target) => target !== item) : [...getAlertTargets(current), item] } : current);
  /** Adds a user item; false when the name or amount is missing. */
  const addCustomItem = (label: string, bucket: CustomPolicyItem['bucket'], rawAmount: string) => {
    const amount = Number(rawAmount.replaceAll(',', ''));
    if (!label.trim() || !rawAmount.trim() || !Number.isFinite(amount) || amount < 0) { notify('사용자 항목 이름과 금액을 확인해 주세요.'); return false; }
    const item: CustomPolicyItem = { id: crypto.randomUUID(), label: label.trim(), bucket, amount: Math.floor(amount) };
    setDraft((current) => current ? { ...current, customItems: [...(current.customItems ?? []), item] } : current);
    return true;
  };
  const removeCustomItem = (id: string) => setDraft((current) => current ? { ...current, customItems: (current.customItems ?? []).filter((item) => item.id !== id) } : current);
  const clearDraft = () => setDraft(null);
  const clear = () => { setText(''); setDraft(null); };

  return { text, setText, draft, focusToken, reviewText, readScreenshot, editSaved, updateAmount, updateProfile, toggleAlertTarget, addCustomItem, removeCustomItem, clearDraft, clear };
}
