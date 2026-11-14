import type { PolicyPeriod } from '../domain/budget';
import type { BackupPayload } from '../domain/backup';
import type { ImportResult, Ledger } from '../domain/ledger';
import type { ImportedCardTransaction } from '../domain/shinhanImport';
import type { PolicyBook } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';
import { BackupRestore } from './BackupRestore';
import { DataIntegrityPanel } from './DataIntegrityPanel';

type Props = {
  importFile: File | null;
  importTransactions: ImportedCardTransaction[] | null;
  importResult: ImportResult | null;
  importReading: boolean;
  importMessage: string | null;
  hasMaskedCardWarning: boolean;
  merchantRules: MerchantRule[];
  ledger: Ledger;
  policyBook: PolicyBook;
  onFileSelected: (file: File | null) => void;
  onPreviewImport: () => void;
  onApplyImport: () => void;
  onOpenImportGuide: () => void;
  onOpenRules: () => void;
  periodKey: string;
  period?: PolicyPeriod;
  canUndoImport: boolean;
  onUndoImport: () => void;
  onResetData: (scopes: Array<'ledger' | 'rules' | 'policy'>) => void;
  onRestore: (payload: BackupPayload) => void;
  notify: (message: string) => void;
};

export function DataManagementPanel(props: Props) {
  return <section className="data-sections">
    <details className="data-section">
      <summary><strong>거래내역</strong><span>카드 CSV·Excel / 은행 PDF</span></summary>
      <div className="data-section__body import-card">
        <p>카드번호 또는 계좌번호 끝 4자리를 입력한 뒤 해당 파일을 가져옵니다. 현재 정책 기간 밖의 거래는 저장하지 않습니다.</p>
        <button className="sheet-action" onClick={props.onOpenImportGuide}>거래내역 가져오기</button>
      </div>
    </details>

    <details className="data-section">
      <summary><strong>자동 분류 규칙</strong><span>{props.merchantRules.length}/50개 저장됨</span></summary>
      <div className="data-section__body merchant-rule-card"><p>상호명 포함 또는 정확히 일치하는 조건을 관리합니다.</p><button className="sheet-action" onClick={props.onOpenRules}>규칙 관리</button></div>
    </details>

    <details className="data-section">
      <summary><strong>백업 · 복원</strong><span>기기 변경과 초기화 대비</span></summary>
      <div className="data-section__body"><BackupRestore embedded ledger={props.ledger} policyBook={props.policyBook} merchantRules={props.merchantRules} onRestore={props.onRestore} notify={props.notify} /></div>
    </details>

    <DataIntegrityPanel ledger={props.ledger} periodKey={props.periodKey} period={props.period} canUndoImport={props.canUndoImport} onUndoImport={props.onUndoImport} onReset={props.onResetData} />
  </section>;
}
