import * as XLSX from 'xlsx';
import { classifyPayment, type PaymentClassification } from './sms';

export type ImportedCardTransaction = { occurredAt: string; cardMasked: string; cardIdentity?: string; merchant: string; approvalNumber: string; amount: number; paymentStatus: string; cancellationStatus: string; classification: PaymentClassification };
const requiredHeaders = ['거래일', '이용카드', '가맹점명', '승인번호', '금액', '매입구분', '취소상태'];
export function parseShinhanCardExport(data: ArrayBuffer): ImportedCardTransaction[] {
  const book = XLSX.read(data, { type: 'array' }); const sheet = book.Sheets[book.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!sheet || !requiredHeaders.every((header) => Object.hasOwn(rows[0] ?? {}, header))) throw new Error('신한카드 이용내역 양식이 아닙니다.');
  return rows.filter((row) => /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/.test(String(row['거래일']))).map((row) => {
    const [date, time] = String(row['거래일']).split(' '); const [year, month, day] = date.split('.');
    const amount = Number(String(row['금액']).replaceAll(',', ''));
    const merchant = String(row['가맹점명']).trim();
    return { occurredAt: `${year}-${month}-${day}T${time}:00+09:00`, cardMasked: String(row['이용카드']).trim(), merchant, approvalNumber: String(row['승인번호']).padStart(8, '0'), amount, paymentStatus: String(row['매입구분']).trim(), cancellationStatus: String(row['취소상태']).trim(), classification: classifyPayment(merchant, amount) };
  });
}
export function isImportable(transaction: ImportedCardTransaction) { return (transaction.paymentStatus === '승인' || transaction.paymentStatus === '결제확정') && !transaction.cancellationStatus; }