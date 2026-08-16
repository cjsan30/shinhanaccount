import { classifyPayment } from './sms';
import type { ImportedCardTransaction } from './shinhanImport';

type PdfTextItem = { str: string; transform: number[] };

export function parseShinhanBankPdfText(text: string): ImportedCardTransaction[] {
  const rows: ImportedCardTransaction[] = [];
  const cardMasks = [...text.matchAll(/(\d{3}\*)/g)].map((match) => match[1]);
  const uniqueCardMasks = [...new Set(cardMasks)];
  if (uniqueCardMasks.length > 1) throw new Error('카드 하나만 선택해 결제 내역을 다시 받아 주세요.');
  const cardMasked = uniqueCardMasks[0] ?? '';
  const linePattern = /^\s*(\d{8})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+([\d,]+)\s+([\d,]+)\s+(.+?)\s+([\d,]+)\s+(\S+)\s*$/u;
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(linePattern);
    if (!match) continue;
    const [, date, time, kind, outgoing, , merchant] = match;
    if (kind !== '체크카드' || Number(outgoing.replaceAll(',', '')) <= 0) continue;
    const amount = Number(outgoing.replaceAll(',', ''));
    const cleanedMerchant = merchant.replace(/\s+/g, ' ').trim();
    const occurredAt = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${time}+09:00`;
    const approvalNumber = `bank-${date}-${time.replaceAll(':', '')}-${amount}-${cleanedMerchant}`;
    rows.push({ occurredAt, cardMasked, merchant: cleanedMerchant, approvalNumber, amount, paymentStatus: '결제확정', cancellationStatus: '', classification: classifyPayment(cleanedMerchant, amount) });
  }
  if (!rows.length) throw new Error('신한은행 PDF에서 체크카드 출금 내역을 찾지 못했습니다.');
  return rows;
}

async function extractPdfText(data: ArrayBuffer, password: string) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
  const document = await pdfjs.getDocument({ data: new Uint8Array(data), ...(password.trim() ? { password } : {}) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const groups = new Map<number, PdfTextItem[]>();
    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str) continue;
      const item = rawItem as PdfTextItem;
      const y = Math.round(item.transform[5] / 2) * 2;
      groups.set(y, [...(groups.get(y) ?? []), item]);
    }
    pages.push([...groups.entries()].sort(([a], [b]) => b - a).map(([, items]) => items.sort((a, b) => a.transform[4] - b.transform[4]).map((item) => item.str).join(' ')).join('\n'));
  }
  return pages.join('\n');
}

export async function parseShinhanBankPdf(data: ArrayBuffer, password: string) {
  if (!password.trim()) throw new Error('PDF 비밀번호를 입력해 주세요.');
  try {
    return parseShinhanBankPdfText(await extractPdfText(data, password));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/password|Password|암호/i.test(message)) throw new Error('PDF 비밀번호가 올바르지 않습니다.');
    throw error;
  }
}