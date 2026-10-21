import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMerchantRule, type MerchantRule } from '../../domain/merchantRules';
import { RuleManager } from './RuleManager';

const categoryNames = { food: '식비', generalCafe: '카페', transport: '교통비' };
const rule = (merchant: string, category = 'food', bucket: 'resident' | 'studySpace' = 'resident') => createMerchantRule(merchant, { bucket, category }, '2026-09-20T00:00:00.000Z');

function Harness({ initial, notify }: { initial: MerchantRule[]; notify: (message: string) => void }) {
  const [rules, setRules] = useState(initial);
  return <><RuleManager rules={rules} categoryNames={categoryNames} onRulesChange={setRules} notify={notify} /><output data-testid="rules">{JSON.stringify(rules.map((item) => [item.merchant, item.category, item.matchMode ?? 'contains', item.alias ?? '']))}</output></>;
}
const saved = () => JSON.parse(screen.getByTestId('rules').textContent ?? '[]');

afterEach(() => { vi.restoreAllMocks(); });

describe('RuleManager', () => {
  it('adds an exact-match rule with an alias and shows it in the list', () => {
    const notify = vi.fn();
    render(<Harness initial={[]} notify={notify} />);
    fireEvent.change(screen.getByLabelText('규칙 상호명'), { target: { value: '스터디룸 강남' } });
    fireEvent.change(screen.getByLabelText('규칙 표시 별칭'), { target: { value: '스터디' } });
    fireEvent.change(screen.getByLabelText('규칙 인식 방법'), { target: { value: 'exact' } });
    fireEvent.change(screen.getByLabelText('규칙 분류'), { target: { value: 'cafe' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));
    expect(saved()).toEqual([['스터디룸 강남', 'generalCafe', 'exact', '스터디']]);
    expect(screen.getByText('스터디룸 강남 · 정확히 일치 · 카페')).toBeInTheDocument();
    expect(screen.getByLabelText('규칙 상호명')).toHaveValue('');
    expect(notify).toHaveBeenCalledWith('다음 결제부터 이 상호명 규칙을 적용합니다. 기존 내역은 바꾸지 않습니다.');
  });

  it('replaces an existing rule for the same merchant instead of adding a duplicate', () => {
    render(<Harness initial={[rule('메가커피', 'generalCafe', 'studySpace')]} notify={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('규칙 상호명'), { target: { value: '메가커피' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));
    expect(saved()).toEqual([['메가커피', 'food', 'contains', '']]);
  });

  it('refuses a 51st rule', () => {
    const notify = vi.fn();
    render(<Harness initial={Array.from({ length: 50 }, (_, index) => rule(`가게${index}`))} notify={notify} />);
    fireEvent.change(screen.getByLabelText('규칙 상호명'), { target: { value: '새 가게' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));
    expect(saved()).toHaveLength(50);
    expect(notify).toHaveBeenCalledWith('자동 분류 규칙은 최대 50개까지 저장할 수 있습니다.');
  });

  it('loads a rule for editing and can cancel back to an empty editor', () => {
    render(<Harness initial={[rule('지하철', 'transport')]} notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    expect(screen.getByLabelText('규칙 상호명')).toHaveValue('지하철');
    expect(screen.getByLabelText('규칙 분류')).toHaveValue('transport');
    fireEvent.click(screen.getByRole('button', { name: '수정 취소' }));
    expect(screen.getByLabelText('규칙 상호명')).toHaveValue('');
    expect(screen.getByRole('button', { name: '규칙 추가' })).toBeInTheDocument();
  });

  it('keeps the rule when deletion is not confirmed', () => {
    const notify = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<Harness initial={[rule('지하철', 'transport')]} notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(saved()).toHaveLength(1);
    expect(notify).not.toHaveBeenCalled();
  });

  it('reports an invalid merchant without saving', () => {
    const notify = vi.fn();
    render(<Harness initial={[]} notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));
    expect(saved()).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
