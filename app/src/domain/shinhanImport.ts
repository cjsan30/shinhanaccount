import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

export type ImportedCardTransaction = { occurredAt: string; cardMasked: string; cardIdentity?: string; merchant: string; approvalNumber: string; amount: number; paymentStatus: string; cancellationStatus: string };
const requiredHeaders = ['거래일', '이용카드', '가맹점명', '승인번호', '금액', '매입구분', '취소상태'];
export async function parseShinhanCardExport(data: ArrayBuffer): Promise<ImportedCardTransaction[]> {
  const XLSX = await import('xlsx');
  const readRows = (book: ReturnType<typeof XLSX.read>) => {
    const sheet = book.Sheets[book.SheetNames[0]];
    return { sheet, rows: sheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }) : [] };
  };
  let { sheet, rows } = readRows(XLSX.read(data, { type: 'array' }));
  const hasHeaders = () => Boolean(sheet) && requiredHeaders.every((header) => Object.hasOwn(rows[0] ?? {}, header));
  // XLSX treats ArrayBuffer CSV content as legacy binary. Retry known Korean CSV encodings as text.
  if (!hasHeaders()) {
    for (const encoding of ['utf-8', 'euc-kr'] as const) {
      const text = new TextDecoder(encoding).decode(data).replace(/^\uFEFF/, '');
      ({ sheet, rows } = readRows(XLSX.read(text, { type: 'string' })));
      if (hasHeaders()) break;
    }
  }
  if (!hasHeaders()) throw new Error('신한카드 이용내역 양식이 아닙니다.');
  return rows.filter((row) => /^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}$/.test(String(row['거래일']))).map((row) => {
    const [date, time] = String(row['거래일']).split(' '); const [year, month, day] = date.split('.');
    const amount = Number(String(row['금액']).replaceAll(',', ''));
    const merchant = String(row['가맹점명']).trim();
    return { occurredAt: `${year}-${month}-${day}T${time}:00+09:00`, cardMasked: String(row['이용카드']).trim(), merchant, approvalNumber: String(row['승인번호']).padStart(8, '0'), amount, paymentStatus: String(row['매입구분']).trim(), cancellationStatus: String(row['취소상태']).trim() };
  });
}

function amount(value: string) { return Number(value.replace(/[^0-9]/g, '')); }

// The card PDF is a native-text table. Keeping the text parser separate makes
// its rules testable without a browser PDF worker.
export function parseShinhanCardPdfText(text: string): ImportedCardTransaction[] {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  const cardMasked = lines.find((line) => /본인\s*\d{3}\*/.test(line))?.match(/본인\s*(\d{3}\*)/)?.[1] ?? '';
  const joined = lines.join(' ');
  const matches = [...joined.matchAll(/(20\d{2}[./-]\d{2}[./-]\d{2})\s+(\d{2}:\d{2})(?:\s+|.*?)([\d,]+)원?\s+([^\d]{2,}?)(?=\s+20\d{2}[./-]\d{2}|$)/g)];
  return matches.map((matched, index) => {
    const [, rawDate, time, rawAmount, rawMerchant] = matched;
    const [year, month, day] = rawDate.replace(/[./]/g, '-').split('-'); const merchant = rawMerchant.trim().replace(/\s+(일시불|체크|승인|국내).*$/u, '').trim();
    const value = amount(rawAmount);
    return { occurredAt: `${year}-${month}-${day}T${time}:00+09:00`, cardMasked, merchant: merchant || '가맹점 정보 없음', approvalNumber: `pdf-${year}${month}${day}-${time.replace(':', '')}-${value}-${index}`, amount: value, paymentStatus: '승인', cancellationStatus: '' };
  }).filter((transaction) => transaction.amount > 0);
}

export async function parseShinhanCardPdfExport(data: ArrayBuffer): Promise<ImportedCardTransaction[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(data) }); const source = await task.promise;
  try {
    const pages = await Promise.all(Array.from({ length: source.numPages }, async (_, index) => {
      const content = await (await source.getPage(index + 1)).getTextContent();
      return content.items.map((item) => 'str' in item ? item.str : '').join('\n');
    }));
    const transactions = parseShinhanCardPdfText(pages.join('\n'));
    if (!transactions.length) throw new Error('신한카드 PDF에서 거래 행을 찾지 못했습니다. 카드이용내역 PDF인지 확인해 주세요.');
    return transactions;
  } finally { await task.destroy(); }
}
export function isImportable(transaction: ImportedCardTransaction) {
  return (transaction.paymentStatus === '승인' || transaction.paymentStatus === '결제확정')
    && !transaction.cancellationStatus
    && Number.isFinite(transaction.amount)
    && transaction.amount > 0;
}
