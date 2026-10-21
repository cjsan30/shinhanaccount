import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPolicy, type SupportPolicy } from '../../domain/policy';

const { policyOcr } = vi.hoisted(() => ({ policyOcr: { pickAndRecognize: vi.fn() } }));
vi.mock('../../native/policyOcr', () => ({ PolicyOcr: policyOcr }));
import { usePolicyDraft } from './usePolicyDraft';

const saved: SupportPolicy = { ...emptyPolicy, plans: { ...emptyPolicy.plans, food: 200000, cafe: 100000 }, period: { startDay: 1, endDay: 30 }, profileId: 'shinhanhae-40', alertTargets: ['cafe'] };
const planText = '식비 300,000\n카페 50,000';
const setup = () => { const notify = vi.fn(); const view = renderHook(() => usePolicyDraft(saved, notify)); return { notify, view }; };

beforeEach(() => { policyOcr.pickAndRecognize.mockReset(); });

describe('usePolicyDraft', () => {
  it('asks for text before reviewing an empty plan', () => {
    const { notify, view } = setup();
    act(() => view.result.current.reviewText());
    expect(notify).toHaveBeenCalledWith('계획표 내용을 붙여넣어 주세요.');
    expect(view.result.current.draft).toBeNull();
  });

  it('parses pasted text but keeps the saved period, profile and alert targets', () => {
    const { view } = setup();
    act(() => view.result.current.setText(planText));
    act(() => view.result.current.reviewText());
    expect(view.result.current.draft).toMatchObject({ period: { startDay: 1, endDay: 30 }, profileId: 'shinhanhae-40', alertTargets: ['cafe'] });
    expect(view.result.current.draft?.plans.food).toBe(300000);
    expect(view.result.current.focusToken).toBe(1);
  });

  it('fills the text and draft from a screenshot', async () => {
    policyOcr.pickAndRecognize.mockResolvedValue({ text: planText });
    const { notify, view } = setup();
    await act(async () => { await view.result.current.readScreenshot(); });
    expect(view.result.current.text).toBe(planText);
    expect(view.result.current.draft?.plans.cafe).toBe(50000);
    expect(notify).toHaveBeenCalledWith('스크린샷의 텍스트를 읽었습니다. 검토 후 확정해 주세요.');
  });

  it('explains an unreadable or cancelled screenshot without creating a draft', async () => {
    const { notify, view } = setup();
    policyOcr.pickAndRecognize.mockResolvedValueOnce({ text: '  ' });
    await act(async () => { await view.result.current.readScreenshot(); });
    expect(notify).toHaveBeenLastCalledWith('사진에서 읽을 수 있는 텍스트가 없습니다.');
    policyOcr.pickAndRecognize.mockRejectedValueOnce(new Error('cancelled'));
    await act(async () => { await view.result.current.readScreenshot(); });
    expect(notify).toHaveBeenLastCalledWith('사진 선택 또는 텍스트 인식을 취소했습니다.');
    expect(view.result.current.draft).toBeNull();
  });

  it('edits a copy of the saved plan without changing the saved one', () => {
    const { view } = setup();
    act(() => view.result.current.editSaved());
    act(() => view.result.current.updateAmount('food', '250,000'));
    act(() => view.result.current.updateAmount('food', '-1'));
    act(() => view.result.current.updateAmount('cafe', 'abc'));
    act(() => view.result.current.updateProfile('shinhanhae-70'));
    act(() => view.result.current.updatePeriod({ startDay: 15, endDay: 10 }));
    act(() => view.result.current.toggleAlertTarget('cafe'));
    act(() => view.result.current.toggleAlertTarget('food'));
    expect(view.result.current.draft).toMatchObject({ plans: { food: 250000, cafe: 100000 }, profileId: 'shinhanhae-70', period: { startDay: 15, endDay: 10 }, alertTargets: ['food'] });
    expect(saved.plans.food).toBe(200000);
    expect(saved.alertTargets).toEqual(['cafe']);
  });

  it('ignores edits when there is no draft and clears text and draft together', () => {
    const { view } = setup();
    act(() => view.result.current.updateAmount('food', '1000'));
    expect(view.result.current.draft).toBeNull();
    act(() => view.result.current.setText(planText));
    act(() => view.result.current.reviewText());
    act(() => view.result.current.clearDraft());
    expect(view.result.current.draft).toBeNull();
    expect(view.result.current.text).toBe(planText);
    act(() => view.result.current.clear());
    expect(view.result.current.text).toBe('');
  });
});
