// Android System WebView can lag modern browsers. The legacy build ships the
// Map.getOrInsertComputed polyfill required by protected Shinhan PDFs.
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export type ImportedBankTransaction = {
  source: 'bankCsv';
  occurredAt: string;
  accountMasked?: string;
  merchant: string;
  summary?: string;
  balance?: number;
  branch?: string;
  amount: number;
  transactionId: string;
  direction: 'withdrawal' | 'deposit';
  /** 원본 PDF를 유지한 채 제출용으로 가릴 수 있게 하는 원본 좌표다. */
  sourcePage?: number;
  sourceY?: number;
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
    return [{ source: 'bankCsv' as const, occurredAt, accountMasked: valueAt(row, accountHeaders), merchant, amount, transactionId: `${occurredAt}|${merchant}|${amount}|${index}`, direction }];
  });
  if (!parsed.length) throw new Error('읽을 수 있는 입출금 행이 없습니다.');
  return parsed;
}

export function getMaskedAccountLast4(value: string | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function parseShinhanBankPdfText(text: string): ImportedBankTransaction[] {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const accountMasked = lines.find((line) => /(계좌|번호)/.test(line) && /\d[\d*-]{3,}/.test(line))?.match(/[\d*-]{4,}/)?.[0] ?? '';
  const rows = lines.flatMap((line, index) => {
    const date = line.match(/(20\d{2})[./-](\d{2})[./-](\d{2})/); const time = line.match(/(\d{2}:\d{2}(?::\d{2})?)/); const directionText = line.match(/(출금|입금)/)?.[1];
    const detail = directionText ? line.slice(line.indexOf(directionText) + directionText.length) : ''; const amounts = [...detail.matchAll(/([\d,]+)원?/g)].map((match) => parseAmount(match[1])).filter((value) => value > 0);
    if (!date || !time || !directionText || !amounts.length) return [];
    const direction: ImportedBankTransaction['direction'] = directionText === '출금' ? 'withdrawal' : 'deposit';
    const merchant = detail.replace(/[\d,]+원?/g, '').replace(/\s+/g, ' ').trim() || `${directionText} 내역`;
    const occurredAt = `${date[1]}-${date[2]}-${date[3]}T${time[1].padEnd(8, ':00')}+09:00`;
    const value = amounts[0];
    return [{ source: 'bankCsv' as const, occurredAt, accountMasked, merchant, amount: value, transactionId: `${occurredAt}|${merchant}|${value}|${index}`, direction }];
  });
  if (!rows.length) throw new Error('신한은행 PDF에서 입출금 행을 찾지 못했습니다. 입출금내역 PDF인지 확인해 주세요.');
  return rows;
}

type PdfCell = { text: string; x: number; y: number; page?: number };

// Shinhan Bank's statement is a real table, not a prose PDF. Values on one
// visual row are separate PDF text items, so rebuild them by their y position
// and then read the fixed column bands.
export function parseShinhanBankPdfTable(cells: PdfCell[]): ImportedBankTransaction[] {
  const accountMasked = cells.find((cell) => /\d{10,}/.test(cell.text))?.text ?? '';
  // PDF text items in one visual row can differ by one or two pixels. Cluster
  // them with a tolerance instead of concatenating nearby table rows.
  const grouped: Array<{ y: number; page: number; cells: PdfCell[] }> = [];
  for (const cell of [...cells].sort((left, right) => right.y - left.y)) {
    const page = cell.page ?? 0;
    const group = grouped.find((candidate) => candidate.page === page && Math.abs(candidate.y - cell.y) <= 2);
    if (group) group.cells.push(cell); else grouped.push({ y: cell.y, page, cells: [cell] });
  }
  const rows: ImportedBankTransaction[] = [];
  for (const group of grouped) {
    const sorted = [...group.cells].sort((left, right) => left.x - right.x); const date = sorted.find((cell) => /^20\d{6}$/.test(cell.text))?.text; const time = sorted.find((cell) => /^\d{2}:\d{2}:\d{2}$/.test(cell.text))?.text;
    if (!date || !time) continue;
    const inBand = (from: number, to: number) => sorted.filter((cell) => cell.x >= from && cell.x < to).map((cell) => cell.text).join(' ').trim();
    const amountAt = (from: number, to: number, target: number) => sorted
      .filter((cell) => cell.x >= from && cell.x < to)
      .map((cell) => ({ value: parseAmount(cell.text), distance: Math.abs(cell.x - target) }))
      .filter((cell) => Number.isFinite(cell.value) && cell.value > 0)
      .sort((left, right) => left.distance - right.distance)[0]?.value ?? 0;
    // Amounts are right-aligned: a large deposit can start near x=313 while
    // withdrawals stay left of x=300. Keeping the bands disjoint prevents a
    // deposit (e.g. support payment) from becoming a false withdrawal.
    const description = inBand(149, 245); const withdrawal = amountAt(245, 300, 270); const deposit = amountAt(300, 360, 340); const merchant = inBand(360, 420) || description || '입출금 내역'; const balance = amountAt(420, 505, 466); const branch = inBand(505, Number.POSITIVE_INFINITY);
    const direction: ImportedBankTransaction['direction'] = withdrawal > 0 ? 'withdrawal' : 'deposit'; const amount = withdrawal > 0 ? withdrawal : deposit;
    if (!amount) continue;
    const occurredAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time}+09:00`;
    rows.push({ source: 'bankCsv', occurredAt, accountMasked, merchant, summary: description, ...(balance ? { balance } : {}), ...(branch ? { branch } : {}), amount, transactionId: `${occurredAt}|${merchant}|${amount}|${rows.length}`, direction, sourcePage: group.page, sourceY: group.y });
  }
  if (!rows.length) throw new Error('신한은행 PDF에서 입출금 표 행을 찾지 못했습니다. 입출금내역 PDF인지 확인해 주세요.');
  return rows;
}

export async function parseShinhanBankPdfExport(data: ArrayBuffer, password?: string): Promise<ImportedBankTransaction[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(data), password: password || undefined }); const source = await task.promise;
  try {
    const pages = await Promise.all(Array.from({ length: source.numPages }, async (_, index) => {
      const content = await (await source.getPage(index + 1)).getTextContent();
      return content.items.flatMap((item) => 'str' in item && item.str ? [{ text: item.str, x: Number(item.transform[4]), y: Number(item.transform[5]), page: index }] : []);
    }));
    return parseShinhanBankPdfTable(pages.flat()).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  } finally { await task.destroy(); }
}
