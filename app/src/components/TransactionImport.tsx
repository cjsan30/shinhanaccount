import { useEffect, useRef, useState } from 'react';
import { filterTransactionsForConfiguredCard } from '../domain/cardImportSafety';
import { filterImportToPolicyPeriod } from '../domain/importPolicy';
import { parseShinhanBankPdfExport, getMaskedAccountLast4, type ImportedBankTransaction } from '../domain/shinhanBankImport';
import { parseShinhanCardExport, parseShinhanCardPdfExport, type ImportedCardTransaction } from '../domain/shinhanImport';
import { openShinhanSolPay } from '../native/externalApp';
import { readSelectedFile } from '../native/fileRead';

export type TransactionImportPayload = { source: 'card' | 'account'; identifierLast4: string; cardTransactions?: ImportedCardTransaction[]; bankTransactions?: ImportedBankTransaction[]; excludedOutsidePeriod: number };
type Props = { cardLast4: string; periodKey: string; onImport: (payload: TransactionImportPayload) => void; notify: (message: string) => void; };
type ImportKind = 'card' | 'account';
const identifierWarning = '파일 안에서 4자리를 확인할 수 없습니다. 선택한 카드·계좌의 내역인지 확인해 주세요.';

export function TransactionImport({ cardLast4, periodKey, onImport, notify }: Props) {
  const [kind, setKind] = useState<ImportKind>('card'); const [identifier, setIdentifier] = useState(cardLast4); const [pdfPassword, setPdfPassword] = useState('');
  const [file, setFile] = useState<File | null>(null); const [payload, setPayload] = useState<TransactionImportPayload | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false); const [reading, setReading] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const guideVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => { const video = guideVideoRef.current; if (!video || !('IntersectionObserver' in window)) return; const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) void video.play().catch(() => undefined); else video.pause(); }, { threshold: 0.2 }); observer.observe(video); return () => observer.disconnect(); }, []);
  const selectKind = (next: ImportKind) => { setKind(next); setIdentifier(next === 'card' ? cardLast4 : ''); setPdfPassword(''); setFile(null); setPayload(null); setNeedsConfirmation(false); setMessage(null); };
  const readFile = async () => {
    if (!file || !/^\d{4}$/.test(identifier)) { setMessage(`${kind === 'card' ? '카드' : '계좌'} 끝 4자리를 입력해 주세요.`); return; }
    setReading(true); setMessage('파일을 읽고 있습니다…'); setPayload(null); setNeedsConfirmation(false);
    try {
      const data = await readSelectedFile(file);
      if (kind === 'account') {
        const parsed = await parseShinhanBankPdfExport(data, pdfPassword); const candidates = parsed.filter((row) => row.direction === 'withdrawal');
        const period = filterImportToPolicyPeriod(candidates, periodKey); const fileLast4 = getMaskedAccountLast4(candidates.find((row) => row.accountMasked)?.accountMasked);
        if (fileLast4 && fileLast4 !== identifier) throw new Error('선택한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다.');
        if (!period.included.length) throw new Error('현재 정책 기간에 가져올 출금 내역이 없습니다. 기간을 확인해 주세요.');
        setPayload({ source: 'account', identifierLast4: identifier, bankTransactions: period.included, excludedOutsidePeriod: period.excludedOutsidePeriod });
        setNeedsConfirmation(!fileLast4); setMessage(`${period.included.length}건의 기간 내 출금 내역을 확인했습니다.${period.excludedOutsidePeriod ? ` 기간 외 ${period.excludedOutsidePeriod}건은 가져오지 않습니다.` : ''}`);
        return;
      }
      const parsed = /\.pdf$/i.test(file.name) || file.type === 'application/pdf' ? await parseShinhanCardPdfExport(data) : await parseShinhanCardExport(data);
      const safety = filterTransactionsForConfiguredCard(parsed, identifier);
      const matching = safety.status === 'ready' ? safety.transactions : parsed.filter((transaction) => !transaction.cardMasked);
      if (safety.status === 'rejected' && matching.length === 0 && parsed.some((transaction) => transaction.cardMasked)) throw new Error('선택한 카드와 일치하는 결제 내역을 찾지 못했습니다.');
      const period = filterImportToPolicyPeriod(matching, periodKey);
      if (!period.included.length) throw new Error('현재 정책 기간에 가져올 승인 내역이 없습니다. 기간을 확인해 주세요.');
      setPayload({ source: 'card', identifierLast4: identifier, cardTransactions: period.included, excludedOutsidePeriod: period.excludedOutsidePeriod });
      setNeedsConfirmation(safety.status !== 'ready' || safety.hasMaskedCardWarning || !matching.some((transaction) => transaction.cardIdentity));
      setMessage(`${period.included.length}건의 기간 내 신한카드 내역을 확인했습니다.${period.excludedOutsidePeriod ? ` 기간 외 ${period.excludedOutsidePeriod}건은 가져오지 않습니다.` : ''}`);
    } catch (error) { const failure = error instanceof Error ? `읽지 못했습니다: ${error.message}` : '읽지 못했습니다: 파일 형식 또는 비밀번호를 확인해 주세요.'; setMessage(failure); notify(failure); } finally { setReading(false); }
  };
  const accept = kind === 'card' ? '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.pdf,application/pdf';
  return <section className="import-card import-card--guided">
    {kind === 'card' && <><video ref={guideVideoRef} className="import-card__example import-card__video" autoPlay muted loop playsInline preload="metadata" poster="/onboarding-card-history-example-redacted.png" aria-label="개인정보를 가린 신한 SOL Pay 카드 이용내역 저장 방법 안내 영상"><source src="/onboarding-shinhan-solpay-excel-guide.mp4" type="video/mp4" /></video><section className="import-card__guide"><strong>신한 SOL Pay에서 카드 이용내역 받기</strong><ol><li>우측 상단 <b>돋보기</b>를 누릅니다.</li><li><b>카드이용내역</b>에서 카드와 조회 기간을 선택합니다.</li><li>조회한 뒤 화면 아래 <b>CSV 저장</b>을 누릅니다.</li></ol><button className="import-card__open-app" type="button" onClick={() => void openShinhanSolPay().catch(() => notify('신한카드 앱을 열지 못했습니다. 설치 여부를 확인해 주세요.'))}>신한카드 앱 열기</button></section></>}
    <section className="import-card__upload"><strong>거래내역 파일 등록</strong><div className="import-type-choice"><label><input type="radio" name="import-kind" checked={kind === 'card'} onChange={() => selectKind('card')} /> 카드번호</label><label><input type="radio" name="import-kind" checked={kind === 'account'} onChange={() => selectKind('account')} /> 계좌번호</label></div><p>{kind === 'card' ? '신한카드 CSV 파일을 선택하세요. 기존 Excel 형식도 호환됩니다.' : '신한은행 앱에서 받은 입출금내역 PDF를 선택하세요. 기간 내 출금만 미정 지출 후보로 가져옵니다.'}</p><label className="import-identifier">{kind === 'card' ? '카드' : '계좌'} 끝 4자리<input aria-label={`${kind === 'card' ? '카드' : '계좌'} 끝 4자리`} inputMode="numeric" maxLength={4} value={identifier} onChange={(event) => setIdentifier(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" /></label>{kind === 'account' && <label className="import-identifier">PDF 비밀번호 <input aria-label="PDF 비밀번호" type="password" autoComplete="off" value={pdfPassword} onChange={(event) => setPdfPassword(event.target.value)} placeholder="보호된 PDF인 경우에만 입력" /></label>}<label className="file-picker">{kind === 'card' ? '신한카드 CSV 파일 선택' : '신한은행 입출금내역 PDF 선택'}<input aria-label="거래내역 파일" type="file" accept={accept} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPayload(null); setNeedsConfirmation(false); setMessage(event.target.files?.[0] ? '파일을 선택했습니다. 파일 읽기를 눌러 확인하세요.' : null); }} /></label>{file && <div className="import-preview"><strong className="import-file-name">{file.name}</strong><button className="sheet-action" disabled={reading} onClick={() => void readFile()}>{reading ? '파일 읽는 중…' : '파일 읽기'}</button>{message && <p className={message.startsWith('읽지 못') || message.startsWith('선택한') ? 'import-warning' : 'import-status'} role="status">{message}</p>}</div>}{payload && <div className="import-preview">{needsConfirmation && <p className="import-warning">{identifierWarning}</p>}<strong>{payload.source === 'card' ? payload.cardTransactions?.length ?? 0 : payload.bankTransactions?.length ?? 0}건 확인</strong><span>{payload.source === 'account' ? '가져온 출금 내역은 미정 지출에서 사업 무관 지출을 제외하거나 분류할 수 있습니다.' : '가져오기 전 자동 분류 결과를 적용합니다.'}</span><button className="sheet-action" onClick={() => onImport(payload)}>{needsConfirmation ? '확인 후 계속 진행' : '내역 가져오기'}</button></div>}</section>
  </section>;
}
