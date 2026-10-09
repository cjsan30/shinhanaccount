import type { PolicyPeriod } from '../domain/budget';
import { useState } from 'react';
import { filterTransactionsForConfiguredCard } from '../domain/cardImportSafety';
import { filterImportToPolicyPeriod } from '../domain/importPolicy';
import { parseShinhanBankPdfExport, getMaskedAccountLast4, type ImportedBankTransaction } from '../domain/shinhanBankImport';
import { parseShinhanCardExport, type ImportedCardTransaction } from '../domain/shinhanImport';
import { openShinhanSolPay } from '../native/externalApp';
import { readSelectedFile } from '../native/fileRead';

export type ImportPreviewCounts = { read: number; eligible: number; outsidePeriod: number; ignoredDeposits?: number };
export type TransactionImportPayload = { source: 'card' | 'account'; identifierLast4: string; cardTransactions?: ImportedCardTransaction[]; bankTransactions?: ImportedBankTransaction[]; excludedOutsidePeriod: number; preview: ImportPreviewCounts; statement?: { file: File; transactions: ImportedBankTransaction[]; requiresPassword: boolean } };
type Props = { cardLast4: string; periodKey: string;
  period?: PolicyPeriod; onImport: (payload: TransactionImportPayload) => void; notify: (message: string) => void; };
type ImportKind = 'card' | 'account';
const identifierWarning = '파일 안에서 4자리를 확인할 수 없습니다. 선택한 카드·계좌의 내역인지 확인해 주세요.';
const CARD_FILE_EXTENSIONS = ['csv', 'xls', 'xlsx'];
const ACCOUNT_FILE_EXTENSIONS = ['pdf'];
const MAX_CARD_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ACCOUNT_FILE_BYTES = 20 * 1024 * 1024;

function getFileExtension(fileName: string) {
  return fileName.trim().split('.').pop()?.toLowerCase() ?? '';
}

function validateSelectedImportFile(file: File, kind: ImportKind) {
  const extension = getFileExtension(file.name);
  const allowedExtensions = kind === 'card' ? CARD_FILE_EXTENSIONS : ACCOUNT_FILE_EXTENSIONS;
  const sizeLimit = kind === 'card' ? MAX_CARD_FILE_BYTES : MAX_ACCOUNT_FILE_BYTES;
  const sourceName = kind === 'card' ? '신한카드 CSV 또는 Excel' : '신한은행 입출금내역 PDF';
  if (!allowedExtensions.includes(extension)) throw new Error(`${sourceName} 파일만 읽을 수 있습니다.`);
  if (!file.size) throw new Error('빈 파일은 읽을 수 없습니다. 다시 내려받은 파일을 선택해 주세요.');
  if (file.size > sizeLimit) throw new Error(`${sourceName} 파일은 ${Math.floor(sizeLimit / 1024 / 1024)}MB 이하만 읽을 수 있습니다.`);
}

function importFailureMessage(error: unknown) {
  const detail = error instanceof Error ? error.message : '';
  if (/(no password|password.*(required|incorrect)|encrypted|passwordexception)/i.test(detail)) return '암호화된 PDF입니다. 비밀번호를 입력한 뒤 다시 읽어 주세요.';
  return detail ? `읽지 못했습니다: ${detail}` : '읽지 못했습니다. 파일 형식 또는 비밀번호를 확인해 주세요.';
}

export function TransactionImport({ cardLast4, periodKey, period: policyPeriod, onImport, notify }: Props) {
  const [reuseStatement, setReuseStatement] = useState(false);
  const [kind, setKind] = useState<ImportKind>('card'); const [identifier, setIdentifier] = useState(cardLast4); const [pdfPassword, setPdfPassword] = useState('');
  const [file, setFile] = useState<File | null>(null); const [payload, setPayload] = useState<TransactionImportPayload | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false); const [reading, setReading] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const selectKind = (next: ImportKind) => { setReuseStatement(false); setKind(next); setIdentifier(next === 'card' ? cardLast4 : ''); setPdfPassword(''); setFile(null); setPayload(null); setNeedsConfirmation(false); setMessage(null); };
  const readFile = async () => {
    if (!file || !/^\d{4}$/.test(identifier)) { setMessage(`${kind === 'card' ? '카드' : '계좌'} 끝 4자리를 입력해 주세요.`); return; }
    setReading(true); setMessage('파일을 읽고 있습니다…'); setPayload(null); setNeedsConfirmation(false);
    try {
      validateSelectedImportFile(file, kind);
      const data = await readSelectedFile(file);
      if (kind === 'account') {
        const parsed = await parseShinhanBankPdfExport(data, pdfPassword); const candidates = parsed.filter((row) => row.direction === 'withdrawal');
        const period = filterImportToPolicyPeriod(candidates, periodKey, policyPeriod); const fileLast4 = getMaskedAccountLast4(candidates.find((row) => row.accountMasked)?.accountMasked);
        if (fileLast4 && fileLast4 !== identifier) throw new Error('선택한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다.');
        if (!period.included.length) throw new Error('현재 정책 기간에 가져올 출금 내역이 없습니다. 기간을 확인해 주세요.');
        setPayload({ source: 'account', identifierLast4: identifier, bankTransactions: period.included, statement: { file, transactions: parsed, requiresPassword: Boolean(pdfPassword) }, excludedOutsidePeriod: period.excludedOutsidePeriod, preview: { read: parsed.length, eligible: period.included.length, outsidePeriod: period.excludedOutsidePeriod, ignoredDeposits: parsed.length - candidates.length } });
        setNeedsConfirmation(!fileLast4); setMessage(`${period.included.length}건의 기간 내 출금 내역을 확인했습니다.${period.excludedOutsidePeriod ? ` 기간 외 ${period.excludedOutsidePeriod}건은 가져오지 않습니다.` : ''}`);
        return;
      }
      const parsed = await parseShinhanCardExport(data);
      const safety = filterTransactionsForConfiguredCard(parsed, identifier);
      const matching = safety.status === 'ready' ? safety.transactions : parsed.filter((transaction) => !transaction.cardMasked);
      if (safety.status === 'rejected' && matching.length === 0 && parsed.some((transaction) => transaction.cardMasked)) throw new Error('선택한 카드와 일치하는 결제 내역을 찾지 못했습니다.');
      const period = filterImportToPolicyPeriod(matching, periodKey, policyPeriod);
      if (!period.included.length) throw new Error('현재 정책 기간에 가져올 승인 내역이 없습니다. 기간을 확인해 주세요.');
      setPayload({ source: 'card', identifierLast4: identifier, cardTransactions: period.included, excludedOutsidePeriod: period.excludedOutsidePeriod, preview: { read: matching.length, eligible: period.included.length, outsidePeriod: period.excludedOutsidePeriod } });
      setNeedsConfirmation(safety.status !== 'ready' || safety.hasMaskedCardWarning || !matching.some((transaction) => transaction.cardIdentity));
      setMessage(`${period.included.length}건의 기간 내 신한카드 내역을 확인했습니다.${period.excludedOutsidePeriod ? ` 기간 외 ${period.excludedOutsidePeriod}건은 가져오지 않습니다.` : ''}`);
    } catch (error) { const failure = importFailureMessage(error); setMessage(failure); notify(failure); } finally { setReading(false); }
  };
  const accept = kind === 'card' ? '.csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : '.pdf,application/pdf';
  return <section className="import-card import-card--guided"><section className="import-card__upload">
    <strong>거래내역 파일 등록</strong><p className="import-card__intro">신한카드 결제내역 또는 신한은행 입출금내역 파일을 등록할 수 있어요. 파일 종류를 선택하고 카드 또는 계좌 끝 4자리를 입력해 주세요.</p>
    <div className="import-type-choice"><label><input type="radio" name="import-kind" checked={kind === 'card'} onChange={() => selectKind('card')} /> 카드번호</label><label><input type="radio" name="import-kind" checked={kind === 'account'} onChange={() => selectKind('account')} /> 계좌번호</label></div>
    {kind === 'card' ? <section className="import-card__guide"><strong>신한카드 이용내역</strong><p>신한카드 앱에서 카드이용내역을 조회한 뒤 CSV로 저장해 선택하세요. 기존 Excel 형식도 등록할 수 있으며, 정책 기간 내 승인 내역만 가져옵니다.</p><button className="import-card__open-app" type="button" onClick={() => void openShinhanSolPay().catch(() => notify('신한카드 앱을 열지 못했습니다. 설치 여부를 확인해 주세요.'))}>신한카드 앱 열기</button></section> : <section className="import-card__guide"><strong>신한은행 입출금내역</strong><p>신한은행 앱에서 입출금내역 PDF를 저장해 선택하세요. 보호된 PDF는 비밀번호를 입력하며, 정책 기간 내 출금 내역만 미정 지출 후보로 가져옵니다.</p></section>}
    <label className="import-identifier">{kind === 'card' ? '카드' : '계좌'} 끝 4자리<input aria-label={`${kind === 'card' ? '카드' : '계좌'} 끝 4자리`} inputMode="numeric" maxLength={4} value={identifier} onChange={(event) => { setIdentifier(event.target.value.replace(/\D/g, '').slice(0, 4)); setPayload(null); }} placeholder="0000" /></label>
    {kind === 'account' && <label className="import-identifier">PDF 비밀번호 <input aria-label="PDF 비밀번호" type="password" autoComplete="off" value={pdfPassword} onChange={(event) => setPdfPassword(event.target.value)} placeholder="보호된 PDF인 경우에만 입력" /></label>}
    <label className="file-picker">{kind === 'card' ? '신한카드 CSV·Excel 파일 선택' : '신한은행 입출금내역 PDF 선택'}<input aria-label="거래내역 파일" type="file" accept={accept} onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPayload(null); setNeedsConfirmation(false); setMessage(event.target.files?.[0] ? '파일을 선택했습니다. 파일 읽기를 눌러 확인하세요.' : null); }} /></label>
    {file && <div className="import-preview"><strong className="import-file-name">{file.name}</strong><button className="sheet-action" disabled={reading} onClick={() => void readFile()}>{reading ? '파일 읽는 중…' : '파일 읽기'}</button>{message && <p className={message.startsWith('읽지 못') || message.startsWith('선택한') || message.startsWith('암호화') ? 'import-warning' : 'import-status'} role="status">{message}</p>}</div>}
    {payload && <div className="import-preview">{needsConfirmation && <p className="import-warning">{identifierWarning}</p>}<strong>{payload.preview.eligible}건 가져오기 준비</strong><ul className="import-preview-counts"><li>파일에서 읽은 {payload.preview.read}건</li><li>정책 기간 내 {payload.preview.eligible}건</li><li>기간 외 제외 {payload.preview.outsidePeriod}건</li>{payload.preview.ignoredDeposits !== undefined && <li>입금 제외 {payload.preview.ignoredDeposits}건</li>}</ul><span>{payload.source === 'account' ? '가져온 출금 내역은 미정 지출에서 사업 무관 지출을 제외하거나 분류할 수 있습니다.' : '가져오기 전 자동 분류 결과를 적용합니다.'}</span>{payload.source === 'account' && <label className="import-reuse-statement"><input type="checkbox" checked={reuseStatement} onChange={(event) => setReuseStatement(event.target.checked)} /> 이 파일을 제출 PDF에도 추가<small>원본을 보관합니다. 보호된 PDF 비밀번호는 저장하지 않으며, 생성할 때 다시 입력합니다.</small></label>}<button className="sheet-action" onClick={() => onImport({ ...payload, statement: reuseStatement ? payload.statement : undefined })}>{needsConfirmation ? '확인 후 계속 진행' : '내역 가져오기'}</button></div>}
  </section></section>;
}
