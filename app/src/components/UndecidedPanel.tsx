import { useEffect, useState } from 'react';
import type { LedgerEntry } from '../domain/ledger';
import { type AnyPolicyItemDefinition } from '../domain/policy';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
type PolicyDefinition = AnyPolicyItemDefinition;
type Props = { entries: LedgerEntry[]; items: readonly PolicyDefinition[]; onClassify: (ids: string[], item: PolicyDefinition, saveRule: boolean) => void };

export function UndecidedPanel({ entries, items, onClassify }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [itemKey, setItemKey] = useState<string>(items[0]?.key ?? 'food');
  const [saveRule, setSaveRule] = useState(false);
  const item = items.find((candidate) => candidate.key === itemKey) ?? items[0];
  useEffect(() => {
    const availableIds = new Set(entries.map((entry) => entry.id));
    setSelected((current) => {
      const next = current.filter((id) => availableIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [entries]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  const classifySelected = () => {
    onClassify(selected, item!, saveRule);
    setSelected([]);
    setSaveRule(false);
  };
  if (!entries.length || !item) return <p>현재 기간에 미정 지출이 없습니다.</p>;
  return <section className="undecided-panel">
    <div className="undecided-bulk"><label><input type="checkbox" aria-label="미정 지출 전체 선택" checked={selected.length === entries.length} onChange={(event) => setSelected(event.target.checked ? entries.map((entry) => entry.id) : [])} /> 전체 선택</label><span>{selected.length}건 선택</span></div>
    <div className="undecided-list" aria-label="미정 지출 목록">
      {entries.map((entry) => <article className="reclassify-card" key={entry.id}><label className="undecided-check"><input type="checkbox" aria-label={`${entry.merchant} 선택`} checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></label><div className="reclassify-card__merchant"><strong>{entry.merchant}</strong></div><div className="reclassify-card__meta"><time>{entry.occurredAt.slice(0, 16).replace('T', ' ')}</time><b>{won(entry.amount)}</b></div></article>)}
    </div>
    {selected.length > 0 && <div className="undecided-quick-action"><label>분류 항목<select aria-label="미정 지출 일괄 분류" value={itemKey} onChange={(event) => setItemKey(event.target.value)}>{items.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.bucket === 'resident' ? '정주비' : '학습공간비'} · {candidate.label}</option>)}</select></label><div><span>{selected.length}건 선택</span><button className="sheet-action" onClick={classifySelected}>바로 분류</button></div>{selected.length === 1 && <label className="undecided-rule"><input type="checkbox" checked={saveRule} onChange={(event) => setSaveRule(event.target.checked)} disabled={item.ledgerCategories[0]?.startsWith('custom:')} /> 이 상호명도 자동 분류 규칙으로 저장</label>}{item.ledgerCategories[0]?.startsWith('custom:') && <small>사용자 항목은 직접 분류에만 사용합니다.</small>}</div>}
  </section>;
}
