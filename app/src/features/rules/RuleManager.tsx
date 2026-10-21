import { useState } from 'react';
import { createMerchantRule, type MerchantMatchMode, type MerchantRule } from '../../domain/merchantRules';
import { POLICY_ITEMS, type PolicyItem } from '../../domain/policy';

const MAX_MERCHANT_RULES = 50;

type Props = {
  rules: MerchantRule[];
  categoryNames: Record<string, string>;
  onRulesChange: (update: (current: MerchantRule[]) => MerchantRule[]) => void;
  notify: (message: string) => void;
};

/** The editor starts empty each time the panel opens; only the saved rules persist. */
export function RuleManager({ rules, categoryNames, onRulesChange, notify }: Props) {
  const [merchant, setMerchant] = useState('');
  const [itemKey, setItemKey] = useState<PolicyItem>('food');
  const [matchMode, setMatchMode] = useState<MerchantMatchMode>('contains');
  const [alias, setAlias] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const reset = () => { setMerchant(''); setItemKey('food'); setMatchMode('contains'); setAlias(''); setEditingId(null); };
  const save = () => {
    const item = POLICY_ITEMS.find((candidate) => candidate.key === itemKey);
    if (!item) return;
    try {
      const created = createMerchantRule(merchant, { bucket: item.bucket, category: item.ledgerCategories[0] }, new Date().toISOString(), matchMode, alias);
      const remaining = rules.filter((current) => current.id !== editingId && current.normalizedMerchant !== created.normalizedMerchant);
      if (remaining.length >= MAX_MERCHANT_RULES) { notify('자동 분류 규칙은 최대 50개까지 저장할 수 있습니다.'); return; }
      const previous = rules.find((current) => current.id === editingId);
      const rule = previous ? { ...created, id: previous.id } : created;
      onRulesChange(() => [...remaining, rule]);
      reset();
      notify(previous ? '자동 분류 규칙을 수정했습니다.' : '다음 결제부터 이 상호명 규칙을 적용합니다. 기존 내역은 바꾸지 않습니다.');
    }
    catch (error) { notify(error instanceof Error ? error.message : '규칙을 저장하지 못했습니다.'); }
  };
  const edit = (rule: MerchantRule) => {
    const item = POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(String(rule.category)));
    setMerchant(rule.merchant);
    if (item) setItemKey(item.key);
    setMatchMode(rule.matchMode ?? 'contains');
    setAlias(rule.alias ?? '');
    setEditingId(rule.id);
  };
  const remove = (rule: MerchantRule) => {
    if (!window.confirm(`'${rule.merchant}' 자동 분류 규칙을 삭제할까요?`)) return;
    onRulesChange((current) => current.filter((candidate) => candidate.id !== rule.id));
    if (editingId === rule.id) reset();
    notify('자동 분류 규칙을 삭제했습니다.');
  };

  return <section className="rule-manager">
    <p>결제처에 키워드가 포함되면 자동 분류합니다. 정확 일치는 상호명 전체가 같을 때만 적용됩니다.</p>
    <div className="rule-editor">
      <label>상호명 또는 키워드<input aria-label="규칙 상호명" value={merchant} onChange={(event) => setMerchant(event.target.value)} placeholder="예: 메가커피" /></label>
      <label>표시 별칭 (선택)<input aria-label="규칙 표시 별칭" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="예: 스터디 카페" maxLength={40} /></label>
      <label>인식 방법<select aria-label="규칙 인식 방법" value={matchMode} onChange={(event) => setMatchMode(event.target.value as MerchantMatchMode)}><option value="contains">포함</option><option value="exact">정확히 일치</option></select></label>
      <label>분류 항목<select aria-label="규칙 분류" value={itemKey} onChange={(event) => setItemKey(event.target.value as PolicyItem)}>{POLICY_ITEMS.map((item) => <option key={item.key} value={item.key}>{item.bucket === 'resident' ? '정주비' : '학습공간비'} · {item.label}</option>)}</select></label>
      <button className="sheet-action" onClick={save}>{editingId ? '규칙 수정 저장' : '규칙 추가'}</button>
      {editingId && <button className="sheet-action secondary-action" onClick={reset}>수정 취소</button>}
    </div>
    <div className="rule-management-list">
      <strong>저장된 자동 분류 규칙 {rules.length}/50</strong>
      {rules.length ? [...rules].sort((a, b) => a.merchant.localeCompare(b.merchant, 'ko')).map((rule) => <article key={rule.id}>
        <div><strong>{rule.alias || rule.merchant}</strong><span>{rule.alias ? `${rule.merchant} · ` : ''}{(rule.matchMode ?? 'contains') === 'contains' ? '포함' : '정확히 일치'} · {categoryNames[rule.category]}</span></div>
        <button type="button" onClick={() => edit(rule)}>수정</button>
        <button type="button" className="delete-action" onClick={() => remove(rule)}>삭제</button>
      </article>) : <p>저장된 자동 분류 규칙이 없습니다.</p>}
    </div>
  </section>;
}
