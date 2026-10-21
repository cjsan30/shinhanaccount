import { parseReceiptOcr } from '../../../domain/receiptOcr';
import { bytesToBase64 } from '../../../native/fileExport';
import { ReceiptOcr } from '../../../native/receiptOcr';
import { jpeg } from './render';

export async function recognizeReceiptDetails(file: File) {
  const bitmap = await createImageBitmap(file);
  // Do not scale a long receipt by its height: that turns a 5,000px receipt
  // into a ~300px-wide image and ML Kit cannot read its figures. Preserve a
  // readable width while limiting the total bitmap pixels for mobile safety.
  const maxWidth = 1440; const maxPixels = 8_000_000;
  const scale = Math.min(1, maxWidth / bitmap.width, Math.sqrt(maxPixels / (bitmap.width * bitmap.height)));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  try {
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('영수증 이미지를 준비하지 못했습니다.');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const bytes = await jpeg(canvas, .8); const result = await ReceiptOcr.recognize({ base64Data: bytesToBase64(bytes) });
    // OCR is an input aid, not an evidence-link decision maker. Amounts on a
    // receipt can be totals, discounts, gift certificates, or card charges.
    const { date } = parseReceiptOcr(result.text);
    return { ...(date ? { date } : {}) };
  } finally { bitmap.close(); canvas.width = 1; canvas.height = 1; }
}
export function resolvedReceiptPatch(details: { date?: string }, manual = false) {
  if (details.date) return { receiptOcrStatus: 'ambiguous' as const, receiptOcrMessage: manual ? '선택한 날짜의 결제 중 하나를 눌러 연결해 주세요.' : '결제 날짜를 읽었습니다. 같은 날짜의 결제 중 하나를 선택해 주세요.', linkedEntryId: undefined, receiptAutoLinked: undefined };
  return { receiptOcrStatus: 'needs-input' as const, receiptOcrMessage: manual ? '날짜를 선택하면 해당 날짜의 결제를 보여드립니다.' : '결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.', linkedEntryId: undefined, receiptAutoLinked: undefined };
}
