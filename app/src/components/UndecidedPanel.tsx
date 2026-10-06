import { useEffect, useState } from 'react';
import type { LedgerEntry } from '../domain/ledger';
import { type AnyPolicyItemDefinition } from '../domain/policy';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
type PolicyDefinition = AnyPolicyItemDefinition;
type Props = { entries: LedgerEntry[]; allEntries?: LedgerEntry[]; items: readonly PolicyDefinition[]; onResolveDuplicate?: (incomingId: string, existingId: string, same: boolean) => void; onClassify: (ids: string[], item: PolicyDefinition, saveRule: boolean) => void; onExclude: (ids: string[]) => void };

export function UndecidedPanel({ entries, allEntries = entries, items, onResolveDuplicate, onClassify, onExclude }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [itemKey, setItemKey] = useState<string>(items[0]?.key ?? 'food');
  const [saveRule, setSaveRule] = useState(false);
  const item = items.find((candidate) => candidate.key === itemKey) ?? items[0];
  const selectable = entries.filter((entry) => !entry.duplicateCandidateIds?.length);
  useEffect(() => {
    const availableIds = new Set(entries.filter((entry) => !entry.duplicateCandidateIds?.length).map((entry) => entry.id));
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
  const excludeSelected = () => {
    onExclude(selected);
    setSelected([]);
    setSaveRule(false);
  };
  if (!entries.length || !item) return <p>현재 기간에 미정 지출이 없습니다.</p>;
  return <section className="undecided-panel">
    <div className="undecided-bulk"><label><input type="checkbox" aria-label="미정 지출 전체 선택" disabled={!selectable.length} checked={selectable.length > 0 && selected.length === selectable.length} onChange={(event) => setSelected(event.target.checked ? selectable.map((entry) => entry.id) : [])} /> 전체 선택</label><span>{selected.length}건 선택</span></div>
    <div className="undecided-list" aria-label="미정 지출 목록">
      {entries.map((entry) => <div key={entry.id}><article className="reclassify-card"><label className="undecided-check"><input type="checkbox" aria-label={`${entry.merchant} 선택`} disabled={Boolean(entry.duplicateCandidateIds?.length)} checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></label><div className="reclassify-card__merchant"><strong>{entry.merchant}</strong></div><div className="reclassify-card__meta"><time>{entry.occurredAt.slice(0, 16).replace('T', ' ')}</time><b>{won(entry.amount)}</b></div></article>{entry.duplicateCandidateIds?.map((id) => { const existing = allEntries.find((candidate) => candidate.id === id); return existing && <section className="duplicate-review" key={id} aria-label={`${entry.merchant} 중복 확인`}><strong>같은 거래인가요?</strong><p>{existing.merchant} · {won(existing.amount)}<br />{existing.occurredAt.slice(0, 16).replace('T', ' ')} · {existing.status === 'undecided' ? '미정 지출' : '기존 결제'}{existing.category ? ` · ${items.find((candidate) => candidate.ledgerCategories.includes(existing.category!))?.label ?? existing.category}` : ''}</p><div><button type="button" onClick={() => onResolveDuplicate?.(entry.id, id, true)}>Yes</button><button type="button" onClick={() => onResolveDuplicate?.(entry.id, id, false)}>No</button></div></section>; })}</div>)}
    </div>
    {selected.length > 0 && <div className="undecided-quick-action"><label>분류 항목<select aria-label="미정 지출 일괄 분류" value={itemKey} onChange={(event) => setItemKey(event.target.value)}>{items.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.bucket === 'resident' ? '정주비' : '학습공간비'} · {candidate.label}</option>)}</select></label><div className="undecided-quick-action__buttons"><span>{selected.length}건 선택</span><button className="sheet-action" onClick={classifySelected}>바로 분류</button><button className="sheet-action secondary-action" onClick={excludeSelected}>사업 무관 제외</button></div>{selected.length === 1 && <label className="undecided-rule"><input type="checkbox" checked={saveRule} onChange={(event) => setSaveRule(event.target.checked)} disabled={item.ledgerCategories[0]?.startsWith('custom:')} /> 이 상호명도 자동 분류 규칙으로 저장</label>}{item.ledgerCategories[0]?.startsWith('custom:') && <small>사용자 항목은 직접 분류에만 사용합니다.</small>}</div>}
  </section>;
}
