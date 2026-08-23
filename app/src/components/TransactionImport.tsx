import { useState } from 'react';
import { filterTransactionsForConfiguredCard } from '../domain/cardImportSafety';
import { parseShinhanCardExport, type ImportedCardTransaction } from '../domain/shinhanImport';

type Props = {
  cardLast4: string;
  onImport: (transactions: ImportedCardTransaction[]) => void;
  onDirectStart: () => void;
  notify: (message: string) => void;
};

export function TransactionImport({ cardLast4, onImport, onDirectStart, notify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [transactions, setTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [warning, setWarning] = useState(false);
  const readFile = async () => {
    if (!file) return;
    try {
      const parsed = await parseShinhanCardExport(await file.arrayBuffer());
      const safety = filterTransactionsForConfiguredCard(parsed, cardLast4);
      if (safety.status === 'rejected') {
        setTransactions(null);
        notify(safety.reason === 'ambiguous-card-identity' ? '카드 하나만 선택해 결제 내역을 다시 받아 주세요.' : '설정 카드와 일치하는 결제 내역을 찾지 못했습니다.');
        return;
      }
      setWarning(safety.hasMaskedCardWarning);
      setTransactions(safety.transactions);
    } catch (error) { notify(error instanceof Error ? error.message : '파일 형식 또는 비밀번호를 확인해 주세요.'); }
  };
  return <section className="import-card"><p>신한카드 앱에서 카드 하나만 선택해 내려받은 이용내역 엑셀(.xls/.xlsx)을 선택하세요.</p><label className="file-picker">신한카드 엑셀 파일 선택<input aria-label="거래내역 파일" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setTransactions(null); event.currentTarget.value = ''; }} /></label>{file && <div className="import-preview"><strong className="import-file-name">{file.name}</strong><button className="sheet-action" onClick={() => void readFile()}>파일 읽기</button></div>}{transactions && <div className="import-preview">{warning && <p className="import-warning">카드 번호가 일부 가려져 있어 설정 카드 기준으로 일치하는 내역만 가져옵니다.</p>}<strong>{transactions.length}건 확인</strong><span>가져오기 전 분류 결과를 적용합니다.</span><button className="sheet-action" onClick={() => onImport(transactions)}>내역 가져오기</button></div>}<button className="sheet-action secondary-action" onClick={onDirectStart}>직접 등록으로 시작</button></section>;
}
