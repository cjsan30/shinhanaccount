import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PolicyPeriod } from '../../../domain/budget';
import { isInPeriodScope } from '../../../domain/periodSelectors';
import { formatStatementAmount, redactStatementRows, type StatementRow } from '../../../domain/statementRedaction';
import { drawRowMask, drawSolidMask } from './canvasMasks';
import { isStatementPageFullyHidden, planAccountNumberMasks, planStatementRowMasks, statementHiddenReasons, statementPageRows, statementRowOccurredAt } from './statementMaskLayout';
import { detectStatementTableGeometry, type StatementTableGeometry } from './statementTableGeometry';
import { ExportCancelled, type ExportProfile, type RasterImage, type ReportSummary } from './types';

const won = (value: number) => `${Math.max(0, value).toLocaleString('ko-KR')}원`;

export async function jpeg(canvas: HTMLCanvasElement, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('이미지를 압축하지 못했습니다.')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}
export async function compressImage(file: File, maxEdge: number, quality: number): Promise<RasterImage[]> {
  const bitmap = await createImageBitmap(file); const width = Math.min(bitmap.width, maxEdge); const result: RasterImage[] = [];
  try { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.max(1, Math.round(bitmap.height * width / bitmap.width)); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지를 압축하지 못했습니다.'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); result.push({ bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; } finally { bitmap.close(); }
  return result;
}
export async function renderPdf(file: File, dpi: number, quality: number, onPage: () => void, cancelled: () => boolean): Promise<RasterImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); const source = await task.promise; const result: RasterImage[] = [];
  try { for (let index = 1; index <= source.numPages; index += 1) { if (cancelled()) throw new ExportCancelled(); const page = await source.getPage(index); const viewport = page.getViewport({ scale: dpi / 72 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PDF 페이지를 준비하지 못했습니다.'); await page.render({ canvas, canvasContext: ctx, viewport }).promise; result.push({ bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; page.cleanup(); onPage(); } } finally { await task.destroy(); }
  return result;
}
export async function renderMaskedStatementPdf(file: File, rows: StatementRow[], excludedRowIds: string[], profile: ExportProfile, periodKey: string, onPage: () => void, cancelled: () => boolean, password?: string, period?: PolicyPeriod): Promise<RasterImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...(password ? { password } : {}) }); const source = await task.promise.catch((error: unknown) => {
    // The table was read with the right password but the field now holds another value; pdf.js would show its own English message.
    throw (error as { name?: unknown } | null)?.name === 'PasswordException' ? new Error('입출금내역 PDF 비밀번호가 맞지 않습니다. 비밀번호를 다시 입력해 주세요.') : error;
  }); const result: RasterImage[] = [];
  try {
    const hiddenReasons = statementHiddenReasons(rows, excludedRowIds, { periodKey, period });
    for (let index = 0; index < source.numPages; index += 1) {
      if (cancelled()) throw new ExportCancelled();
      const page = await source.getPage(index + 1); const scale = (profile.pdfDpi ?? 150) / 72; const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('입출금내역 페이지를 준비하지 못했습니다.');
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const pageRows = statementPageRows(rows, index);
      let geometry: StatementTableGeometry | undefined;
      if (pageRows.length) {
        try { geometry = detectStatementTableGeometry(ctx.getImageData(0, 0, canvas.width, canvas.height), scale, pageRows.map((row) => row.sourceY!)); } catch { geometry = undefined; }
      }
      // Pages containing no visible transaction are omitted. This saves output
      // size without reconstructing or changing the original table rows.
      if (isStatementPageFullyHidden(pageRows, hiddenReasons)) { page.cleanup(); onPage(); continue; }
      planStatementRowMasks(pageRows, hiddenReasons, scale, canvas, geometry).forEach((rect) => drawRowMask(ctx, rect));
      const text = await page.getTextContent();
      const items = text.items.flatMap((item) => 'str' in item ? [{ str: item.str, x: Number(item.transform[4]), y: Number(item.transform[5]) }] : []);
      planAccountNumberMasks(items, scale, canvas.height).forEach((rect) => drawSolidMask(ctx, rect));
      result.push({ bytes: await jpeg(canvas, profile.quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; page.cleanup(); onPage();
    }
  } finally { await task.destroy(); }
  return result;
}
export async function pdfPages(file: File) { const { PDFDocument } = await import('pdf-lib'); return (await PDFDocument.load(await file.arrayBuffer())).getPageCount(); }

// Korean text is rasterized intentionally: PDF standard fonts omit Korean glyphs on Android.
export async function pageImage(summary: ReportSummary, quality: number): Promise<RasterImage> {
  await document.fonts?.ready; const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('요약 페이지를 준비하지 못했습니다.'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1240, 1754); const x = 92; let y = 130; const font = 'Pretendard, "Noto Sans KR", sans-serif';
  ctx.fillStyle = '#102338'; ctx.font = `700 54px ${font}`; ctx.fillText('지원금 사용 요약', x, y); ctx.fillStyle = '#6d7885'; ctx.font = `400 28px ${font}`; ctx.fillText(`${summary.periodLabel} 적용 기간`, x, y + 54); y += 142; ctx.fillStyle = '#eff8f7'; ctx.fillRect(x, y, 1056, 230); ctx.fillStyle = '#587078'; ctx.font = `600 28px ${font}`; ctx.fillText('총 지원금', x + 42, y + 58); ctx.fillStyle = '#112b37'; ctx.font = `700 58px ${font}`; ctx.fillText(won(summary.totalBudget), x + 42, y + 132); ctx.fillStyle = '#587078'; ctx.font = `500 28px ${font}`; const remain = summary.totalBudget - summary.totalUsed; ctx.fillText(`사용 ${won(summary.totalUsed)} · ${summary.totalBudget <= 0 ? '확정된 계획 없음' : remain > 0 ? `잔액 ${won(remain)}` : '지원금 소진'}`, x + 42, y + 188); y += 300;
  for (const bucket of summary.buckets) { ctx.fillStyle = '#102338'; ctx.font = `700 38px ${font}`; ctx.fillText(bucket.label, x, y); ctx.fillStyle = '#587078'; ctx.font = `500 25px ${font}`; ctx.fillText(`계획 ${won(bucket.budget)} · 사용 ${won(bucket.used)} · 잔액 ${won(bucket.budget - bucket.used)}`, x + 250, y); y += 42; ctx.fillStyle = '#d9e1e5'; ctx.fillRect(x, y, 1056, 2); y += 44; for (const item of bucket.items) { ctx.fillStyle = '#263b4b'; ctx.font = `600 25px ${font}`; ctx.fillText(item.label, x + 20, y); ctx.fillStyle = '#4e6070'; ctx.font = `500 24px ${font}`; ctx.fillText(`계획 ${won(item.budget)}`, x + 390, y); ctx.fillText(`사용 ${won(item.used)}`, x + 650, y); ctx.fillStyle = '#0e6f6b'; ctx.font = `700 24px ${font}`; ctx.fillText(`잔액 ${won(item.budget - item.used)}`, x + 855, y); y += 52; } y += 38; }
  ctx.fillStyle = '#6d7885'; ctx.font = `400 22px ${font}`; ctx.fillText('이후 페이지에는 입출금내역, 거래증빙, 세부 항목별 영수증이 이어집니다.', x, 1640); return { bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height };
}
export async function divider(label: string, quality: number): Promise<RasterImage> { await document.fonts?.ready; const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('구분 페이지를 준비하지 못했습니다.'); const font = 'Pretendard, "Noto Sans KR", sans-serif'; ctx.fillStyle = '#f4f8f8'; ctx.fillRect(0, 0, 1240, 1754); ctx.fillStyle = '#77d8ca'; ctx.fillRect(92, 760, 14, 180); ctx.fillStyle = '#102338'; ctx.font = `700 36px ${font}`; ctx.fillText('영수증 · 세부 항목', 142, 800); ctx.font = `700 62px ${font}`; ctx.fillText(label, 142, 900); return { bytes: await jpeg(canvas, quality), width: 1240, height: 1754 }; }

export async function statementPages(rows: StatementRow[], excludedRowIds: string[], quality: number, periodKey: string, period?: PolicyPeriod): Promise<RasterImage[]> {
  await document.fonts?.ready;
  const periodWithdrawals = rows.filter((row) => row.withdrawal > 0 && isInPeriodScope({ occurredAt: statementRowOccurredAt(row) }, { periodKey, period }));
  const safeRows = redactStatementRows(periodWithdrawals, excludedRowIds);
  const pageSize = 23;
  const pages: RasterImage[] = [];
  for (let offset = 0; offset < safeRows.length; offset += pageSize) {
    const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754;
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('입출금내역 표를 준비하지 못했습니다.');
    const font = 'Pretendard, "Noto Sans KR", sans-serif'; const visible = safeRows.slice(offset, offset + pageSize);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#102338'; ctx.font = `700 42px ${font}`; ctx.fillText('입출금내역', 64, 88);
    ctx.fillStyle = '#6d7885'; ctx.font = `400 20px ${font}`; ctx.fillText(`제출용 정리 · ${offset + 1}~${offset + visible.length}행`, 64, 122);
    const columns = [92, 320, 530, 1005]; const header = ['일자', '출금', '내용', '잔액'];
    ctx.fillStyle = '#e9eef1'; ctx.fillRect(64, 154, 1112, 42); ctx.fillStyle = '#263b4b'; ctx.font = `600 18px ${font}`; header.forEach((value, index) => ctx.fillText(value, columns[index], 182));
    visible.forEach((row, index) => {
      const y = 196 + index * 57; ctx.fillStyle = row.redacted ? '#f0f0f0' : '#fff'; ctx.fillRect(64, y, 1112, 57); ctx.strokeStyle = '#d6dde2'; ctx.strokeRect(64, y, 1112, 57);
      ctx.fillStyle = row.redacted ? '#707b84' : '#263b4b'; ctx.font = `400 16px ${font}`;
      const dateLabel = row.date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1년 $2월 $3일');
      const values = [dateLabel, formatStatementAmount(row.withdrawal), row.displayMerchant.length > 34 ? `${row.displayMerchant.slice(0, 33)}…` : row.displayMerchant, formatStatementAmount(row.balance ?? 0)];
      values.forEach((value, column) => ctx.fillText(value, columns[column], y + 35));
      if (row.redacted) { ctx.fillStyle = '#7a6a52'; ctx.font = `400 13px ${font}`; ctx.fillText(row.reason ?? '사업 무관 내역', 64, y + 52); }
    });
    ctx.fillStyle = '#6d7885'; ctx.font = `400 15px ${font}`; ctx.fillText('정책 기간 내 출금만 표시합니다. 사업 무관 행은 내용만 가립니다.', 64, 1698);
    pages.push({ bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height });
  }
  return pages;
}
