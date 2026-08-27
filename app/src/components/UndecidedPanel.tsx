import { useState } from 'react';
import type { LedgerEntry } from '../domain/ledger';
import { type PolicyItem, POLICY_ITEMS } from '../domain/policy';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
type PolicyDefinition = (typeof POLICY_ITEMS)[number];
type Props = { entries: LedgerEntry[]; items: readonly PolicyDefinition[]; onClassify: (ids: string[], item: PolicyDefinition, saveRule: boolean) => void };

export function UndecidedPanel({ entries, items, onClassify }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [itemKey, setItemKey] = useState<PolicyItem>(items[0]?.key ?? 'food');
  const [saveRule, setSaveRule] = useState(false);
  const item = items.find((candidate) => candidate.key === itemKey) ?? items[0];
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  if (!entries.length || !item) return <p>현재 기간에 미정 지출이 없습니다.</p>;
  return <section className="undecided-panel">
    <div className="undecided-bulk"><label><input type="checkbox" aria-label="미정 지출 전체 선택" checked={selected.length === entries.length} onChange={(event) => setSelected(event.target.checked ? entries.map((entry) => entry.id) : [])} /> 전체 선택</label><span>{selected.length}건 선택</span></div>
    {entries.map((entry) => <article className="reclassify-card" key={entry.id}><label className="undecided-check"><input type="checkbox" aria-label={`${entry.merchant} 선택`} checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></label><div className="item"><strong>{entry.merchant}</strong><span>{entry.occurredAt.slice(0, 16).replace('T', ' ')} · {won(entry.amount)}</span></div></article>)}
    <div className="undecided-bulk__action"><label>분류 항목<select aria-label="미정 지출 일괄 분류" value={itemKey} onChange={(event) => setItemKey(event.target.value as PolicyItem)}>{items.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.bucket === 'resident' ? '정주비' : '학습공간비'} · {candidate.label}</option>)}</select></label><label className="undecided-rule"><input type="checkbox" checked={saveRule} onChange={(event) => setSaveRule(event.target.checked)} disabled={selected.length !== 1} /> 이 상호명도 앞으로 자동 분류</label><small>{selected.length === 1 ? '선택한 한 건의 상호명에만 개인 규칙을 저장합니다.' : '자동 분류 규칙은 한 건을 선택했을 때만 저장할 수 있습니다.'}</small><button className="sheet-action" disabled={!selected.length} onClick={() => onClassify(selected, item, saveRule)}>선택한 {selected.length}건 분류</button></div>
  </section>;
}
