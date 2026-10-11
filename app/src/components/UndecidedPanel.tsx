import { useEffect, useState } from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import { getRemainingPaymentAmount, getSupportAmount, type LedgerEntry } from '../domain/ledger';
import { type AnyPolicyItemDefinition } from '../domain/policy';
import { getPaymentAmountDisplay } from '../domain/paymentAmountDisplay';

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
type PolicyDefinition = AnyPolicyItemDefinition;
type Props = { entries: LedgerEntry[]; allEntries?: LedgerEntry[]; items: readonly PolicyDefinition[]; onResolveDuplicate?: (incomingId: string, existingId: string, same: boolean) => void; onClassify: (ids: string[], item: PolicyDefinition, saveRule: boolean) => void; onExclude: (ids: string[]) => boolean | void; onSupportAmountChange?: (id: string, amount: number) => void };

export function UndecidedPanel({ entries, allEntries = entries, items, onResolveDuplicate, onClassify, onExclude, onSupportAmountChange }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [expandedAmounts, setExpandedAmounts] = useState<string[]>([]);
  const [amountError, setAmountError] = useState<string | null>(null);
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
    const edits = selected.map((id) => ({ entry: entries.find((entry) => entry.id === id)!, value: drafts[id] }));
    if (edits.some(({ entry, value }) => value !== undefined && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0 || Number(value) > getRemainingPaymentAmount(entry)))) {
      setAmountError('지원금 반영 금액은 남은 결제 금액 이하의 양의 정수로 입력해 주세요.'); return;
    }
    edits.forEach(({ entry, value }) => { if (value !== undefined) onSupportAmountChange?.(entry.id, Number(value)); });
    onClassify(selected, item!, saveRule);
    setSelected([]);
    setSaveRule(false);
  };
  const excludeSelected = () => {
    if (onExclude(selected) === false) return;
    setSelected([]);
    setSaveRule(false);
  };
  if (!entries.length || !item) return <p>현재 기간에 미정 지출이 없습니다.</p>;
  return <section className="undecided-panel">
    <div className="undecided-bulk"><label><input type="checkbox" aria-label="미정 지출 전체 선택" disabled={!selectable.length} checked={selectable.length > 0 && selected.length === selectable.length} onChange={(event) => setSelected(event.target.checked ? selectable.map((entry) => entry.id) : [])} /> 전체 선택</label><span>{selected.length}건 선택</span></div>
    <div className="undecided-list" aria-label="미정 지출 목록">
      {entries.map((entry) => { const { isPortion, primaryAmount } = getPaymentAmountDisplay(entry); const date = entry.occurredAt.slice(0, 16).replace('T', ' '); return <div key={entry.id}>
        <article className={`reclassify-card${isPortion ? ' reclassify-card--portion' : ''}`}>
          <label className="undecided-check"><input type="checkbox" aria-label={`${entry.merchant} 선택`} disabled={Boolean(entry.duplicateCandidateIds?.length)} checked={selected.includes(entry.id)} onChange={() => toggle(entry.id)} /></label>
          <div className="reclassify-card__merchant"><strong>{entry.merchant}</strong>{isPortion && <time>{date}</time>}</div>
          <div className="reclassify-card__meta">{!isPortion && <time>{date}</time>}{onSupportAmountChange && !entry.duplicateCandidateIds?.length ? <button type="button" className="support-amount-toggle" aria-label={`${entry.merchant} 지원금 반영 금액 수정`} aria-expanded={expandedAmounts.includes(entry.id)} aria-controls={expandedAmounts.includes(entry.id) ? `support-amount-${entry.id}` : undefined} onClick={() => setExpandedAmounts((current) => current.includes(entry.id) ? current.filter((id) => id !== entry.id) : [...current, entry.id])}><span>{isPortion && <em>지원금 </em>}{won(primaryAmount)}</span><PencilSimple aria-hidden="true" focusable="false" /></button> : <b>{isPortion && <em>지원금 </em>}{won(primaryAmount)}</b>}{isPortion && <small className="payment-original-amount">원결제 {won(entry.amount)}</small>}</div>
          {onSupportAmountChange && !entry.duplicateCandidateIds?.length && (entry.previousClassification || entry.supportAmountReviewRequired || expandedAmounts.includes(entry.id)) && <div className="support-amount-controls">
            {entry.previousClassification && <small>이전 분류 · {items.find((candidate) => candidate.bucket === entry.previousClassification?.bucket && candidate.ledgerCategories.includes(entry.previousClassification.category))?.label ?? entry.previousClassification.category}</small>}
            {entry.supportAmountReviewRequired && <strong className="support-amount-review">부분 취소 · 금액 재확인 필요{entry.previousSupportAmount !== undefined && <small>이전 지원금 반영 {won(entry.previousSupportAmount)}</small>}</strong>}
            {expandedAmounts.includes(entry.id) && <div className="support-amount-editor" id={`support-amount-${entry.id}`}>
              <label><span>지원금 반영 금액</span><input aria-label={`${entry.merchant} 지원금 반영 금액`} inputMode="numeric" value={drafts[entry.id] ?? String(getSupportAmount(entry))} onChange={(event) => { setDrafts((current) => ({ ...current, [entry.id]: event.target.value })); setAmountError(null); }} onBlur={() => {
                const value = drafts[entry.id];
                if (value === undefined) return;
                if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) <= 0 || Number(value) > getRemainingPaymentAmount(entry)) { setAmountError('지원금 반영 금액을 확인해 주세요. 남은 결제 금액을 초과할 수 없습니다.'); return; }
                onSupportAmountChange(entry.id, Number(value));
              }} /></label>
            </div>}
          </div>}
        </article>
        {entry.duplicateCandidateIds?.map((id) => { const existing = allEntries.find((candidate) => candidate.id === id); return existing && <section className="duplicate-review" key={id} aria-label={`${entry.merchant} 중복 확인`}><strong>같은 거래인가요?</strong><p>{existing.merchant} · {won(existing.amount)}<br />{existing.occurredAt.slice(0, 16).replace('T', ' ')} · {existing.status === 'undecided' ? '미정 지출' : '기존 결제'}{existing.category ? ` · ${items.find((candidate) => candidate.ledgerCategories.includes(existing.category!))?.label ?? existing.category}` : ''}</p><div><button type="button" onClick={() => onResolveDuplicate?.(entry.id, id, true)}>Yes</button><button type="button" onClick={() => onResolveDuplicate?.(entry.id, id, false)}>No</button></div></section>; })}
      </div>; })}
    </div>
    {amountError && <p role="alert" className="import-warning">{amountError}</p>}
    {selected.length > 0 && <div className="undecided-quick-action"><label>분류 항목<select aria-label="미정 지출 일괄 분류" value={itemKey} onChange={(event) => setItemKey(event.target.value)}>{items.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.bucket === 'resident' ? '정주비' : '학습공간비'} · {candidate.label}</option>)}</select></label><div className="undecided-quick-action__buttons"><span>{selected.length}건 선택</span><button className="sheet-action" onClick={classifySelected}>바로 분류</button><button className="sheet-action secondary-action" onClick={excludeSelected}>사업 무관 제외</button></div>{selected.length === 1 && <label className="undecided-rule"><input type="checkbox" checked={saveRule} onChange={(event) => setSaveRule(event.target.checked)} disabled={item.ledgerCategories[0]?.startsWith('custom:')} /> 이 상호명도 자동 분류 규칙으로 저장</label>}{item.ledgerCategories[0]?.startsWith('custom:') && <small>사용자 항목은 직접 분류에만 사용합니다.</small>}</div>}
  </section>;
}
