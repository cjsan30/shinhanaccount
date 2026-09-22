import { useEffect, useRef, useState } from 'react';
import { filterTransactionsForConfiguredCard } from '../domain/cardImportSafety';
import { parseShinhanCardExport, type ImportedCardTransaction } from '../domain/shinhanImport';
import { openShinhanSolPay } from '../native/externalApp';
import { readSelectedFile } from '../native/fileRead';

type Props = {
  cardLast4: string;
  onImport: (transactions: ImportedCardTransaction[]) => void;
  notify: (message: string) => void;
};

export function TransactionImport({ cardLast4, onImport, notify }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [transactions, setTransactions] = useState<ImportedCardTransaction[] | null>(null);
  const [warning, setWarning] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const guideVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = guideVideoRef.current;
    if (!video || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => undefined);
      else video.pause();
    }, { threshold: 0.2 });
    observer.observe(video);
    return () => observer.disconnect();
  }, []);
  const readFile = async () => {
    if (!file) return;
    setReading(true);
    setMessage('파일을 읽고 있습니다…');
    try {
      const parsed = await parseShinhanCardExport(await readSelectedFile(file));
      const safety = filterTransactionsForConfiguredCard(parsed, cardLast4);
      if (safety.status === 'rejected') {
        setTransactions(null);
        const rejection = safety.reason === 'ambiguous-card-identity' ? '카드 하나만 선택해 결제 내역을 다시 받아 주세요.' : '설정 카드와 일치하는 결제 내역을 찾지 못했습니다.';
        setMessage(rejection);
        notify(rejection);
        return;
      }
      setWarning(safety.hasMaskedCardWarning);
      setTransactions(safety.transactions);
      setMessage(`${safety.transactions.length}건의 신한카드 Excel 내역을 확인했습니다.`);
    } catch (error) {
      const failure = error instanceof Error ? `읽지 못했습니다: ${error.message}` : '읽지 못했습니다: 파일 형식 또는 비밀번호를 확인해 주세요.';
      setMessage(failure);
      notify(failure);
    } finally { setReading(false); }
  };
  return <section className="import-card import-card--guided">
    <video ref={guideVideoRef} className="import-card__example import-card__video" autoPlay muted loop playsInline preload="metadata" poster="/onboarding-card-history-example-redacted.png" aria-label="개인정보를 가린 신한 SOL Pay 엑셀 저장 방법 안내 영상">
      <source src="/onboarding-shinhan-solpay-excel-guide.mp4" type="video/mp4" />
    </video>
    <section className="import-card__guide">
      <strong>신한 SOL Pay에서 엑셀 받기</strong>
      <ol>
        <li>우측 상단 <b>돋보기</b>를 누릅니다.</li>
        <li><b>카드이용내역</b>에서 카드와 조회 기간을 선택합니다.</li>
        <li>조회한 뒤 화면 아래 <b>엑셀 저장</b>을 누릅니다.</li>
      </ol>
      <button className="import-card__open-app" type="button" onClick={() => void openShinhanSolPay().catch(() => notify('신한카드 앱을 열지 못했습니다. 설치 여부를 확인해 주세요.'))}>신한카드 앱 열기</button>
    </section>
    <section className="import-card__upload">
      <strong>거래내역 파일 등록</strong>
      <p>카드 하나만 선택해 저장한 신한카드 엑셀(.xls/.xlsx)을 선택하세요.</p>
      <label className="file-picker">신한카드 엑셀 파일 선택<input aria-label="거래내역 파일" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setTransactions(null); setWarning(false); setMessage(event.target.files?.[0] ? '파일을 선택했습니다. 파일 읽기를 눌러 확인하세요.' : null); }} /></label>
      {file && <div className="import-preview"><strong className="import-file-name">{file.name}</strong><button className="sheet-action" disabled={reading} onClick={() => void readFile()}>{reading ? '파일 읽는 중…' : '파일 읽기'}</button>{message && <p className={message.startsWith('읽지 못') || message.startsWith('카드 ') || message.startsWith('설정 ') ? 'import-warning' : 'import-status'} role="status">{message}</p>}</div>}
      {transactions && <div className="import-preview">{warning && <p className="import-warning">카드 번호가 일부 가려져 있어 설정 카드 기준으로 일치하는 내역만 가져옵니다.</p>}<strong>{transactions.length}건 확인</strong><span>가져오기 전 분류 결과를 적용합니다.</span><button className="sheet-action" onClick={() => onImport(transactions)}>내역 가져오기</button></div>}
    </section>
  </section>;
}
