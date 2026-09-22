import { useMemo, useState } from 'react';
import { findSuspectedDuplicates, isEntryInPolicyPeriod, type Ledger } from '../domain/ledger';

type ResetScope = 'ledger' | 'rules' | 'policy';

type Props = {
  ledger: Ledger;
  periodKey: string;
  canUndoImport: boolean;
  onUndoImport: () => void;
  onReset: (scopes: ResetScope[]) => void;
};

export function DataIntegrityPanel({ ledger, periodKey, canUndoImport, onUndoImport, onReset }: Props) {
  const [selected, setSelected] = useState<ResetScope[]>([]);
  const checks = useMemo(() => {
    const active = ledger.entries.filter((entry) => entry.status !== 'cancelled');
    const undecided = active.filter((entry) => entry.status === 'undecided').length;
    const outside = active.filter((entry) => !isEntryInPolicyPeriod(entry, periodKey)).length;
    const duplicates = active.filter((entry) => findSuspectedDuplicates(ledger, entry, entry.id).length > 0).length;
    return { undecided, outside, duplicates };
  }, [ledger, periodKey]);
  const toggle = (scope: ResetScope) => setSelected((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  const reset = () => {
    if (!selected.length) return;
    if (!window.confirm('선택한 앱 데이터만 삭제할까요? 이 작업은 백업으로만 되돌릴 수 있습니다.')) return;
    onReset(selected);
    setSelected([]);
  };
  return <>
    <details className="data-section">
      <summary><strong>누락 가능성 점검</strong><span>가져온 내역 확인</span></summary>
      <div className="data-section__body data-integrity">
        <p>카드사 원본과 대조하기 전에 앱 안에서 확인할 항목입니다. 실제 누락 여부는 최신 엑셀을 다시 가져와 확인합니다.</p>
        <ul>
          <li>미정 지출 <b>{checks.undecided}건</b></li>
          <li>현재 적용 기간 외 결제 <b>{checks.outside}건</b></li>
          <li>중복 확인 필요 <b>{checks.duplicates}건</b></li>
        </ul>
        {canUndoImport && <button className="sheet-action secondary-action" type="button" onClick={onUndoImport}>방금 가져온 내역 실행 취소</button>}
      </div>
    </details>
    <details className="data-section">
      <summary><strong>데이터 초기화</strong><span>선택한 범위만 삭제</span></summary>
      <div className="data-section__body data-integrity">
        <p>초기화 전에 암호화 백업을 권장합니다. 카드사·은행의 원본 내역과 기기 알림 권한은 지우지 않습니다.</p>
        <label><input type="checkbox" checked={selected.includes('ledger')} onChange={() => toggle('ledger')} /> 결제 내역과 미정 지출</label>
        <label><input type="checkbox" checked={selected.includes('rules')} onChange={() => toggle('rules')} /> 저장된 분류 규칙</label>
        <label><input type="checkbox" checked={selected.includes('policy')} onChange={() => toggle('policy')} /> 확정·예약 정책</label>
        <button className="sheet-action danger-action" type="button" disabled={!selected.length} onClick={reset}>선택한 데이터 초기화</button>
      </div>
    </details>
  </>;
}
