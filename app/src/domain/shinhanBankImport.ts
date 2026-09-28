import { classifyPayment, type PaymentClassification } from './sms';

export type ImportedBankTransaction = {
  source: 'bankCsv';
  occurredAt: string;
  accountMasked?: string;
  merchant: string;
  amount: number;
  transactionId: string;
  direction: 'withdrawal' | 'deposit';
  classification: PaymentClassification;
};

type CsvRow = Record<string, string>;

const dateHeaders = ['거래일자', '거래일시', '거래일', '거래일자시간', '일자'];
const timeHeaders = ['거래시간', '시간'];
const amountHeaders = ['출금금액', '출금액', '거래금액', '금액'];
const withdrawalHeaders = ['출금금액', '출금액'];
const depositHeaders = ['입금금액', '입금액'];
const descriptionHeaders = ['거래내용', '적요', '내용', '받는분', '입출금내용'];
const accountHeaders = ['계좌번호', '출금계좌번호', '계좌'];

function decode(data: ArrayBuffer) {
  const bytes = new Uint8Array(data);
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
  // A valid Korean export has Hangul headers. A fallback is needed for older
  // Shinhan exports encoded in EUC-KR/CP949.
  if (/[가-힣]/.test(utf8)) return utf8;
  return new TextDecoder('euc-kr', { fatal: false }).decode(bytes).replace(/^\uFEFF/, '');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value.trim()); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(value.trim()); if (row.some(Boolean)) rows.push(row); row = []; value = '';
    } else value += char;
  }
  row.push(value.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

function valueAt(row: CsvRow, aliases: string[]) { return aliases.map((key) => row[key]).find((value) => Boolean(value?.trim()))?.trim() ?? ''; }
function parseAmount(value: string) { return Number(value.replace(/[^0-9-]/g, '')); }
function parseDate(dateValue: string, timeValue: string) {
  const date = dateValue.replace(/[^0-9]/g, ''); const time = timeValue.replace(/[^0-9]/g, '');
  if (date.length !== 8) return null;
  const hhmmss = (time || '000000').padEnd(6, '0').slice(0, 6);
  return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}:${hhmmss.slice(4, 6)}+09:00`;
}

export function parseShinhanBankCsv(data: ArrayBuffer): ImportedBankTransaction[] {
  const rows = parseCsv(decode(data)); const [headers, ...body] = rows;
  if (!headers?.length) throw new Error('빈 CSV 파일입니다.');
  if (!headers.some((header) => [...dateHeaders, ...amountHeaders, ...withdrawalHeaders, ...depositHeaders].includes(header))) throw new Error('신한은행 입출금내역의 한글 열 제목을 읽지 못했습니다. 신한은행 앱에서 다시 내려받은 CSV를 선택해 주세요.');
  const parsed = body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])) as CsvRow).flatMap((row, index) => {
    const occurredAt = parseDate(valueAt(row, dateHeaders), valueAt(row, timeHeaders));
    const withdrawal = parseAmount(valueAt(row, withdrawalHeaders)); const deposit = parseAmount(valueAt(row, depositHeaders));
    const genericAmount = parseAmount(valueAt(row, amountHeaders));
    const direction: ImportedBankTransaction['direction'] = withdrawal > 0 || (genericAmount < 0 && deposit <= 0) ? 'withdrawal' : 'deposit';
    const amount = withdrawal > 0 ? withdrawal : direction === 'withdrawal' ? Math.abs(genericAmount) : deposit > 0 ? deposit : Math.abs(genericAmount);
    const merchant = valueAt(row, descriptionHeaders);
    if (!occurredAt || !amount || !merchant) return [];
    return [{ source: 'bankCsv' as const, occurredAt, accountMasked: valueAt(row, accountHeaders), merchant, amount, transactionId: `${occurredAt}|${merchant}|${amount}|${index}`, direction, classification: direction === 'withdrawal' ? { status: 'undecided' as const } : classifyPayment(merchant, amount) }];
  });
  if (!parsed.length) throw new Error('읽을 수 있는 입출금 행이 없습니다.');
  return parsed;
}

export function getMaskedAccountLast4(value: string | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}
