import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { SpotlightGuide, type GuideStep } from './SpotlightGuide';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { bytesToBase64, openLatestSavedFile, saveFile } from '../native/fileExport';
import { fitImageInsidePage } from '../features/evidence/imageLayout';
import { loadEvidence, removeStoredEvidence, storeEvidence } from '../native/evidenceVault';
import type { ReportEvidenceRecord, ReportEvidenceSection } from '../domain/reportEvidence';
import { paymentDateInKorea } from '../domain/receiptMatching';
import type { LedgerEntry } from '../domain/ledger';
import { getReportReadiness } from '../domain/reportReadiness';
import { parseShinhanBankPdfExport } from '../domain/shinhanBankImport';
import { formatStatementAmount, redactStatementRows, type StatementRow } from '../domain/statementRedaction';
import { groupStatementMaskBlocks } from '../domain/statementMasking';
import { evidenceRasterCacheKey } from '../features/evidence/rasterCacheKey';
import { isDateInPolicyPeriod, type PolicyPeriod } from '../domain/budget';
import { ReceiptOcr } from '../native/receiptOcr';
import { isValidReceiptDate, parseReceiptOcr } from '../domain/receiptOcr';

type EvidenceKind = 'image' | 'pdf';
type Evidence = ReportEvidenceRecord & { file: File; kind: EvidenceKind; url?: string; pages?: number };
type RasterImage = { bytes: Uint8Array; width: number; height: number };
type ExportProfile = { id: 'default' | 'compact' | 'minimum'; maxEdge: number; quality: number; pdfDpi: number | null };
type Progress = { current: number; total: number; stage: string; attempt: number; measuring?: boolean };
import { BenchmarkCancelled, compareBenchmarks, measureBenchmark, receiptFingerprint, type BenchmarkResult } from '../features/evidence/benchmark';
export type ReportSummary = { periodLabel: string; totalBudget: number; totalUsed: number; buckets: Array<{ key: 'resident' | 'studySpace'; label: string; budget: number; used: number; items: Array<{ category: string; label: string; budget: number; used: number }> }> };
const PDF_GUIDE_STEPS: readonly GuideStep[] = [
  { target: '[data-guide="statement"] > .file-picker', title: '입출금내역을 추가하세요', body: '은행 또는 카드사에서 받은 파일을 추가하세요. 보호된 PDF는 비밀번호를 입력해 다시 읽을 수 있어요.' },
  { target: '.statement-redaction > summary', fallbackTarget: '[data-guide="statement"] > .file-picker', title: '가릴 내역을 확인하세요', body: '파일의 상세보기를 열어 사업 무관 거래를 선택하세요. 선택한 행은 회색으로 가려지며, 입금과 정책 기간 외 행은 자동으로 가려집니다.' },
  { target: '[data-guide="transactionProof"] > .file-picker', title: '추가 증빙은 필요한 경우만', body: '주거비·교통비에 필요한 계좌이체 확인서 등의 자료가 있다면 해당 결제에 연결하세요.' },
  { target: '[data-guide="receipt"] > .file-picker', title: '영수증을 추가하세요', body: '사진이나 스캔 이미지를 추가하세요. 추가된 영수증의 썸네일을 누르면 사진을 크게 볼 수 있어요.' },
  { target: '[data-guide="receipt"] .receipt-payment-candidates', fallbackTarget: '[data-guide="receipt"] .evidence-link', title: '필요하면 결제를 연결하세요', body: '읽어온 날짜를 확인하거나 직접 선택한 뒤 같은 날짜의 결제를 한 번 눌러 연결하세요. 연결은 선택 사항입니다.' },
  { target: '.evidence-export__actions', title: 'PDF를 생성하세요', body: '미연결 경고가 있어도 생성할 수 있고, 미연결 영수증도 별도로 포함됩니다. 생성 후 미리보기로 누락과 글자 선명도를 확인하세요. 파일은 5MB 이하로 자동 최적화하며, 불가능하면 안내합니다.' },
];

const A4: [number, number] = [595.28, 841.89];
const TARGET_BYTES = Math.floor(4.7 * 1024 * 1024);
const MAX_EVIDENCE_FILE_BYTES = 20 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 120 * 1024 * 1024;
const PROFILES: ExportProfile[] = [{ id: 'default', maxEdge: 1024, quality: .58, pdfDpi: null }, { id: 'compact', maxEdge: 920, quality: .5, pdfDpi: 150 }, { id: 'minimum', maxEdge: 800, quality: .42, pdfDpi: 120 }];
const LABEL: Record<ReportEvidenceSection, string> = { statement: '입출금내역', transactionProof: '거래증빙', receipt: '영수증' };
class ExportCancelled extends Error {}
const won = (value: number) => `${Math.max(0, value).toLocaleString('ko-KR')}원`;
const fileSize = (value: number) => `${value.toLocaleString('ko-KR')}B (${(value / 1024 / 1024).toFixed(2)}MB)`;
const supported = (file: File) => ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
const kindOf = (file: File): EvidenceKind => file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'image';



function toStatementRows(transactions: Awaited<ReturnType<typeof parseShinhanBankPdfExport>>): StatementRow[] {
  return transactions.map((transaction) => {
    const date = new Date(transaction.occurredAt);
    return {
      id: transaction.transactionId,
      date: transaction.occurredAt.slice(0, 10),
      time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
      summary: transaction.summary ?? (transaction.direction === 'withdrawal' ? '출금' : '입금'),
      withdrawal: transaction.direction === 'withdrawal' ? transaction.amount : 0,
      deposit: transaction.direction === 'deposit' ? transaction.amount : 0,
      merchant: transaction.merchant,
      ...(transaction.balance ? { balance: transaction.balance } : {}),
      ...(transaction.branch ? { branch: transaction.branch } : {}),
      ...(transaction.sourcePage !== undefined ? { sourcePage: transaction.sourcePage } : {}),
      ...(transaction.sourceY !== undefined ? { sourceY: transaction.sourceY } : {}),
    };
  });
}

async function jpeg(canvas: HTMLCanvasElement, quality: number) {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('이미지를 압축하지 못했습니다.')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}
async function recognizeReceiptDetails(file: File) {
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
function resolvedReceiptPatch(details: { date?: string }, manual = false) {
  if (details.date) return { receiptOcrStatus: 'ambiguous' as const, receiptOcrMessage: manual ? '선택한 날짜의 결제 중 하나를 눌러 연결해 주세요.' : '결제 날짜를 읽었습니다. 같은 날짜의 결제 중 하나를 선택해 주세요.', linkedEntryId: undefined, receiptAutoLinked: undefined };
  return { receiptOcrStatus: 'needs-input' as const, receiptOcrMessage: manual ? '날짜를 선택하면 해당 날짜의 결제를 보여드립니다.' : '결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.', linkedEntryId: undefined, receiptAutoLinked: undefined };
}
async function compressImage(file: File, maxEdge: number, quality: number): Promise<RasterImage[]> {
  const bitmap = await createImageBitmap(file); const width = Math.min(bitmap.width, maxEdge); const result: RasterImage[] = [];
  try { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.max(1, Math.round(bitmap.height * width / bitmap.width)); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('이미지를 압축하지 못했습니다.'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); result.push({ bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; } finally { bitmap.close(); }
  return result;
}
async function renderPdf(file: File, dpi: number, quality: number, onPage: () => void, cancelled: () => boolean): Promise<RasterImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl; const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); const source = await task.promise; const result: RasterImage[] = [];
  try { for (let index = 1; index <= source.numPages; index += 1) { if (cancelled()) throw new ExportCancelled(); const page = await source.getPage(index); const viewport = page.getViewport({ scale: dpi / 72 }); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('PDF 페이지를 준비하지 못했습니다.'); await page.render({ canvas, canvasContext: ctx, viewport }).promise; result.push({ bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; page.cleanup(); onPage(); } } finally { await task.destroy(); }
  return result;
}
function solidMask(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  const safeX = Math.max(0, Math.floor(x)); const safeY = Math.max(0, Math.floor(y));
  const safeWidth = Math.max(1, Math.min(ctx.canvas.width - safeX, Math.ceil(width))); const safeHeight = Math.max(1, Math.min(ctx.canvas.height - safeY, Math.ceil(height)));
  ctx.save(); ctx.fillStyle = '#e5e5e5'; ctx.fillRect(safeX, safeY, safeWidth, safeHeight); ctx.restore();
}
function cleanRowMask(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, label: string) {
  const safeX = Math.max(0, Math.floor(x)); const safeY = Math.max(0, Math.floor(y));
  const safeWidth = Math.max(1, Math.min(ctx.canvas.width - safeX, Math.ceil(width))); const safeHeight = Math.max(1, Math.min(ctx.canvas.height - safeY, Math.ceil(height)));
  // The source layout is a fixed Shinhan table. Draw from its outer grid line
  // to outer grid line, rather than only covering the parsed text cells.
  ctx.save(); ctx.fillStyle = '#e5e5e5'; ctx.fillRect(safeX, safeY, safeWidth, safeHeight); ctx.strokeStyle = '#26343f'; ctx.lineWidth = 1; ctx.strokeRect(safeX + .5, safeY + .5, safeWidth - 1, safeHeight - 1);
  ctx.fillStyle = '#5c6770'; ctx.font = `600 ${Math.max(11, Math.min(16, safeHeight * .48))}px Pretendard, "Noto Sans KR", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, safeX + safeWidth / 2, safeY + safeHeight / 2); ctx.restore();
}
type StatementTableGeometry = { left: number; right: number; horizontalLines: number[] };
const middle = (values: number[]) => { const sorted = [...values].sort((left, right) => left - right); return sorted[Math.floor(sorted.length / 2)]; };

/**
 * Shinhan's PDF is vector-based, so the rendered table grid can be detected
 * reliably. Snapping masks to those lines fixes both a right-edge overrun and
 * taller deposit rows without reconstructing the original statement.
 */
function statementTableGeometry(ctx: CanvasRenderingContext2D, scale: number, rows: StatementRow[]): StatementTableGeometry | undefined {
  const rowCenters = rows.map((row) => ctx.canvas.height - row.sourceY! * scale);
  if (!rowCenters.length) return undefined;
  const minY = Math.max(0, Math.floor(Math.min(...rowCenters) - 36 * scale)); const maxY = Math.min(ctx.canvas.height - 1, Math.ceil(Math.max(...rowCenters) + 36 * scale));
  const expectedLeft = Math.max(0, Math.floor(18 * scale)); const expectedRight = Math.min(ctx.canvas.width - 1, Math.ceil(560 * scale));
  let pixels: Uint8ClampedArray;
  try { pixels = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data; } catch { return undefined; }
  const darkAt = (x: number, y: number) => { const offset = (y * ctx.canvas.width + x) * 4; return pixels[offset] < 125 && pixels[offset + 1] < 125 && pixels[offset + 2] < 125; };
  const lineCandidates: number[] = [];
  for (let y = minY; y <= maxY; y += 1) {
    let dark = 0;
    for (let x = expectedLeft; x <= expectedRight; x += 1) if (darkAt(x, y)) dark += 1;
    if (dark >= (expectedRight - expectedLeft) * .62) lineCandidates.push(y);
  }
  const horizontalLines: number[] = [];
  for (const y of lineCandidates) {
    const previous = horizontalLines[horizontalLines.length - 1];
    if (previous === undefined || y - previous > 2) horizontalLines.push(y);
  }
  if (horizontalLines.length < 2) return undefined;
  const leftEdges: number[] = []; const rightEdges: number[] = [];
  for (const y of horizontalLines) {
    let left = -1; let right = -1;
    for (let x = expectedLeft; x <= expectedRight; x += 1) if (darkAt(x, y)) { left = x; break; }
    for (let x = expectedRight; x >= expectedLeft; x -= 1) if (darkAt(x, y)) { right = x; break; }
    if (left >= 0 && right > left) { leftEdges.push(left); rightEdges.push(right); }
  }
  if (!leftEdges.length) return undefined;
  // A horizontal rule can end a pixel inside an anti-aliased vertical border.
  // Find that vertical border across the whole table height so the fill reaches
  // the actual outer edge on both sides.
  const strongestVertical = (from: number, to: number) => {
    let best = -1; let bestScore = -1;
    for (let x = Math.max(0, from); x <= Math.min(ctx.canvas.width - 1, to); x += 1) {
      let score = 0;
      for (let y = minY; y <= maxY; y += 1) if (darkAt(x, y)) score += 1;
      if (score > bestScore) { best = x; bestScore = score; }
    }
    return bestScore > (maxY - minY) * .35 ? best : undefined;
  };
  const outerVertical = (from: number, to: number, side: 'left' | 'right') => {
    const candidates: number[] = [];
    for (let x = Math.max(0, from); x <= Math.min(ctx.canvas.width - 1, to); x += 1) {
      let score = 0;
      for (let y = minY; y <= maxY; y += 1) if (darkAt(x, y)) score += 1;
      // The outer border can be interrupted by a taller grouped deposit row,
      // so it need only cover a meaningful part of the statement body.
      if (score >= (maxY - minY) * .12) candidates.push(x);
    }
    if (!candidates.length) return undefined;
    return side === 'left' ? Math.min(...candidates) : Math.max(...candidates);
  };
  const left = outerVertical(Math.floor(15 * scale), Math.ceil(60 * scale), 'left') ?? strongestVertical(Math.floor(20 * scale), Math.ceil(45 * scale)) ?? middle(leftEdges);
  const right = outerVertical(Math.floor(500 * scale), Math.ceil(590 * scale), 'right') ?? strongestVertical(Math.floor(530 * scale), Math.ceil(560 * scale)) ?? middle(rightEdges);
  return { left, right, horizontalLines };
}
function gridLineBefore(lines: number[], y: number) { return [...lines].reverse().find((line) => line < y - 1); }
function gridLineAfter(lines: number[], y: number) { return lines.find((line) => line > y + 1); }
async function renderMaskedStatementPdf(file: File, rows: StatementRow[], excludedRowIds: string[], profile: ExportProfile, periodKey: string, onPage: () => void, cancelled: () => boolean, password?: string, period?: PolicyPeriod): Promise<RasterImage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...(password ? { password } : {}) }); const source = await task.promise; const result: RasterImage[] = [];
  try {
    const hiddenReasons = new Map<string, string>();
    rows.filter((row) => row.deposit > 0).forEach((row) => hiddenReasons.set(row.id, '입금 내역 제외'));
    rows.filter((row) => !isDateInPolicyPeriod(new Date(`${row.date}T${row.time || '00:00:00'}+09:00`), periodKey, period)).forEach((row) => hiddenReasons.set(row.id, '정책 기간 외 내역'));
    excludedRowIds.forEach((id) => { if (!hiddenReasons.has(id)) hiddenReasons.set(id, '사업 무관 제외'); });
    for (let index = 0; index < source.numPages; index += 1) {
      if (cancelled()) throw new ExportCancelled();
      const page = await source.getPage(index + 1); const scale = (profile.pdfDpi ?? 150) / 72; const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height); const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('입출금내역 페이지를 준비하지 못했습니다.');
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const pageRows = rows.filter((row) => row.sourcePage === index && row.sourceY !== undefined).sort((left, right) => right.sourceY! - left.sourceY!);
      const geometry = statementTableGeometry(ctx, scale, pageRows);
      // Pages containing no visible transaction are omitted. This saves output
      // size without reconstructing or changing the original table rows.
      if (pageRows.length > 0 && pageRows.every((row) => hiddenReasons.has(row.id))) { page.cleanup(); onPage(); continue; }
      groupStatementMaskBlocks(pageRows, hiddenReasons).forEach((block) => {
        const first = pageRows[block.firstIndex]; const last = pageRows[block.lastIndex];
        const above = pageRows[block.firstIndex - 1]?.sourceY;
        const below = pageRows[block.lastIndex + 1]?.sourceY;
        const upper = above === undefined ? first.sourceY! + 8 : (above + first.sourceY!) / 2 - 1;
        const lower = below === undefined ? last.sourceY! - 8 : (last.sourceY! + below) / 2 + 1;
        const fallbackTop = canvas.height - upper * scale; const fallbackBottom = canvas.height - lower * scale;
        const firstCenter = canvas.height - first.sourceY! * scale; const lastCenter = canvas.height - last.sourceY! * scale;
        const top = geometry ? gridLineBefore(geometry.horizontalLines, firstCenter) ?? fallbackTop : fallbackTop;
        const bottom = geometry ? gridLineAfter(geometry.horizontalLines, lastCenter) ?? fallbackBottom : fallbackBottom;
        const left = geometry?.left ?? 28 * scale; const right = geometry?.right ?? Math.min(canvas.width, 545 * scale);
        cleanRowMask(ctx, left, top, right - left, Math.max(8 * scale, bottom - top), block.label);
      });
      const text = await page.getTextContent();
      for (const item of text.items) {
        if (!('str' in item) || !/\d{10,}/.test(item.str)) continue;
        solidMask(ctx, Number(item.transform[4]) * scale - 4, canvas.height - Number(item.transform[5]) * scale - 18 * scale, Math.max(95 * scale, item.str.length * 10 * scale), 22 * scale);
      }
      result.push({ bytes: await jpeg(canvas, profile.quality), width: canvas.width, height: canvas.height }); canvas.width = 1; canvas.height = 1; page.cleanup(); onPage();
    }
  } finally { await task.destroy(); }
  return result;
}
async function pdfPages(file: File) { const { PDFDocument } = await import('pdf-lib'); return (await PDFDocument.load(await file.arrayBuffer())).getPageCount(); }

// Korean text is rasterized intentionally: PDF standard fonts omit Korean glyphs on Android.
async function pageImage(summary: ReportSummary, quality: number): Promise<RasterImage> {
  await document.fonts?.ready; const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('요약 페이지를 준비하지 못했습니다.'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1240, 1754); const x = 92; let y = 130; const font = 'Pretendard, "Noto Sans KR", sans-serif';
  ctx.fillStyle = '#102338'; ctx.font = `700 54px ${font}`; ctx.fillText('지원금 사용 요약', x, y); ctx.fillStyle = '#6d7885'; ctx.font = `400 28px ${font}`; ctx.fillText(`${summary.periodLabel} 적용 기간`, x, y + 54); y += 142; ctx.fillStyle = '#eff8f7'; ctx.fillRect(x, y, 1056, 230); ctx.fillStyle = '#587078'; ctx.font = `600 28px ${font}`; ctx.fillText('총 지원금', x + 42, y + 58); ctx.fillStyle = '#112b37'; ctx.font = `700 58px ${font}`; ctx.fillText(won(summary.totalBudget), x + 42, y + 132); const remain = summary.totalBudget - summary.totalUsed; ctx.fillStyle = '#587078'; ctx.font = `500 28px ${font}`; ctx.fillText(`사용 ${won(summary.totalUsed)} · ${remain > 0 ? `잔액 ${won(remain)}` : '지원금 소진'}`, x + 42, y + 188); y += 300;
  for (const bucket of summary.buckets) { ctx.fillStyle = '#102338'; ctx.font = `700 38px ${font}`; ctx.fillText(bucket.label, x, y); ctx.fillStyle = '#587078'; ctx.font = `500 25px ${font}`; ctx.fillText(`계획 ${won(bucket.budget)} · 사용 ${won(bucket.used)} · 잔액 ${won(bucket.budget - bucket.used)}`, x + 250, y); y += 42; ctx.fillStyle = '#d9e1e5'; ctx.fillRect(x, y, 1056, 2); y += 44; for (const item of bucket.items) { ctx.fillStyle = '#263b4b'; ctx.font = `600 25px ${font}`; ctx.fillText(item.label, x + 20, y); ctx.fillStyle = '#4e6070'; ctx.font = `500 24px ${font}`; ctx.fillText(`계획 ${won(item.budget)}`, x + 390, y); ctx.fillText(`사용 ${won(item.used)}`, x + 650, y); ctx.fillStyle = '#0e6f6b'; ctx.font = `700 24px ${font}`; ctx.fillText(`잔액 ${won(item.budget - item.used)}`, x + 855, y); y += 52; } y += 38; }
  ctx.fillStyle = '#6d7885'; ctx.font = `400 22px ${font}`; ctx.fillText('이후 페이지에는 입출금내역, 거래증빙, 세부 항목별 영수증이 이어집니다.', x, 1640); return { bytes: await jpeg(canvas, quality), width: canvas.width, height: canvas.height };
}
async function divider(label: string, quality: number): Promise<RasterImage> { await document.fonts?.ready; const canvas = document.createElement('canvas'); canvas.width = 1240; canvas.height = 1754; const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('구분 페이지를 준비하지 못했습니다.'); const font = 'Pretendard, "Noto Sans KR", sans-serif'; ctx.fillStyle = '#f4f8f8'; ctx.fillRect(0, 0, 1240, 1754); ctx.fillStyle = '#77d8ca'; ctx.fillRect(92, 760, 14, 180); ctx.fillStyle = '#102338'; ctx.font = `700 36px ${font}`; ctx.fillText('영수증 · 세부 항목', 142, 800); ctx.font = `700 62px ${font}`; ctx.fillText(label, 142, 900); return { bytes: await jpeg(canvas, quality), width: 1240, height: 1754 }; }

async function statementPages(rows: StatementRow[], excludedRowIds: string[], quality: number, periodKey: string, period?: PolicyPeriod): Promise<RasterImage[]> {
  await document.fonts?.ready;
  const periodWithdrawals = rows.filter((row) => row.withdrawal > 0 && isDateInPolicyPeriod(new Date(`${row.date}T${row.time || '00:00:00'}+09:00`), periodKey, period));
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

export function EvidenceExport({ helpRequest = 0, reportEvidence, onReportEvidenceChange, summary, entries, periodKey, period }: { helpRequest?: number; reportEvidence: ReportEvidenceRecord[]; onReportEvidenceChange: Dispatch<SetStateAction<ReportEvidenceRecord[]>>; summary: ReportSummary; entries: LedgerEntry[]; periodKey: string; period?: PolicyPeriod }) {
  useEffect(() => { if (helpRequest > 0) setGuideOpen(true); }, [helpRequest]);
  const [items, setItems] = useState<Evidence[]>([]); const [message, setMessage] = useState<string | null>(null); const [exporting, setExporting] = useState(false); const [progress, setProgress] = useState<Progress | null>(null); const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null); const [benchmarks, setBenchmarks] = useState<Partial<Record<'legacy' | 'current', BenchmarkResult>>>({}); const [statementPasswords, setStatementPasswords] = useState<Record<string, string>>({}); const [previewReceipt, setPreviewReceipt] = useState<Evidence | null>(null); const [guideOpen, setGuideOpen] = useState(false); const urls = useRef(new Set<string>()); const raster = useRef(new Map<string, RasterImage[]>()); const cancelled = useRef(false);
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []); useEffect(() => () => { if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl); }, [resultPreviewUrl]);
  useEffect(() => { let disposed = false; void Promise.all(reportEvidence.map(async (record) => { try { const file = await loadEvidence(record.stored); const kind = kindOf(file); const url = kind === 'image' ? URL.createObjectURL(file) : undefined; if (url) urls.current.add(url); return { ...record, file, kind, url, pages: kind === 'image' ? 1 : undefined } as Evidence; } catch { return null; } })).then((loaded) => { if (!disposed) setItems(loaded.filter((item): item is Evidence => item !== null)); }); return () => { disposed = true; }; }, [reportEvidence]);
  useEffect(() => { let disposed = false; const pending = items.filter((item) => item.kind === 'pdf' && !item.pages); void Promise.all(pending.map(async (item) => { let pages = 1; try { pages = await pdfPages(item.file); } catch { /* export will give a readable error */ } if (!disposed) setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, pages } : candidate)); })); return () => { disposed = true; }; }, [items]);
  const inSection = (section: ReportEvidenceSection) => items.filter((item) => item.section === section).sort((a, b) => a.order - b.order);
  const addFiles = async (section: ReportEvidenceSection, files: FileList | null) => {
    if (!files) return;
    const selected = [...files];
    const supportedFiles = selected.filter(supported);
    const individuallySafe = supportedFiles.filter((file) => file.size > 0 && file.size <= MAX_EVIDENCE_FILE_BYTES);
    const usedBytes = reportEvidence.reduce((sum, item) => sum + item.stored.size, 0);
    let remainingBytes = Math.max(0, MAX_EVIDENCE_TOTAL_BYTES - usedBytes);
    const valid = individuallySafe.filter((file) => {
      if (file.size > remainingBytes) return false;
      remainingBytes -= file.size;
      return true;
    });
    if (!valid.length) {
      setMessage('추가할 수 있는 제출 파일이 없습니다. JPG, PNG, WEBP, PDF 형식과 파일 크기를 확인해 주세요.');
      return;
    }
    const rejectedType = supportedFiles.length !== selected.length;
    const rejectedSize = individuallySafe.length !== supportedFiles.length;
    const rejectedTotal = valid.length !== individuallySafe.length;
    if (rejectedType || rejectedSize || rejectedTotal) setMessage(`일부 파일을 제외했습니다.${rejectedType ? ' JPG, PNG, WEBP, PDF 형식만 지원합니다.' : ''}${rejectedSize ? ' 파일 하나는 20MB 이하만 추가할 수 있습니다.' : ''}${rejectedTotal ? ' 제출 원본은 합계 120MB 이하만 추가할 수 있습니다.' : ''}`);
    const additions = await Promise.all(valid.map(async (file) => {
      const base = { id: crypto.randomUUID(), stored: await storeEvidence(file), section, ...(section === 'receipt' ? { category: summary.buckets[0]?.items[0]?.category } : {}) } satisfies Omit<ReportEvidenceRecord, 'order'>;
      if (section === 'receipt' && kindOf(file) === 'image') {
        try {
          const details = await recognizeReceiptDetails(file);
          return { ...base, receiptDate: details.date, ...resolvedReceiptPatch(details) };
        } catch {
          return { ...base, receiptOcrStatus: 'failed' as const, receiptOcrMessage: '이미지에서 결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.' };
        }
      }
      if (section !== 'statement' || kindOf(file) !== 'pdf') return base;
      try { return { ...base, statementRows: toStatementRows(await parseShinhanBankPdfExport(await file.arrayBuffer())), excludedStatementRowIds: [], statementParseFailed: false, statementSourceRequiresPassword: false }; }
      catch { setMessage('입출금내역 표를 읽지 못했습니다. 원본 PDF는 제출서류에 포함하지 않으므로 비밀번호를 입력해 다시 읽어 주세요.'); return { ...base, statementParseFailed: true }; }
    }));
    onReportEvidenceChange((current) => { const start = current.filter((item) => item.section === section).length; return [...current, ...additions.map((item, index) => ({ ...item, order: start + index }))]; });
  };
  const update = (id: string, patch: Partial<ReportEvidenceRecord>) => onReportEvidenceChange((current) => current.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, ...patch };
    // A changed date must never retain a link chosen for a different day.
    if (item.section === 'receipt' && 'receiptDate' in patch && !('receiptOcrStatus' in patch)) {
      return { ...next, ...resolvedReceiptPatch({ date: next.receiptDate }, true) };
    }
    return next;
  }));
  const readiness = getReportReadiness(entries, reportEvidence, periodKey, period);
  const payments = readiness.payments;
  const unlinkedReceiptCount = reportEvidence.filter((item) => item.section === 'receipt' && !payments.some((payment) => payment.id === item.linkedEntryId)).length;
  const receiptWarning = readiness.missingReceipts.length || unlinkedReceiptCount ? `영수증 미연결 결제 ${readiness.missingReceipts.length}건 · 결제 미연결 영수증 ${unlinkedReceiptCount}장. 연결하지 않아도 PDF를 생성할 수 있습니다. 미연결 영수증은 별도로 포함됩니다.` : '';
  const receiptCategory = (item: Evidence) => payments.some((payment) => payment.id === item.linkedEntryId) && item.category ? item.category : '__unlinked__';
  const additionalProofPayments = payments.filter((entry) => entry.category === 'lodging' || entry.category === 'transport');
  const linkReceipt = (id: string, entryId: string) => {
    const payment = payments.find((entry) => entry.id === entryId);
    const alreadyLinked = reportEvidence.some((item) => item.section === 'receipt' && item.id !== id && item.linkedEntryId === entryId);
    if (entryId && alreadyLinked) { setMessage('이 결제에는 이미 다른 영수증이 연결되어 있습니다. 연결을 변경하거나 다른 결제를 선택해 주세요.'); return; }
    update(id, { linkedEntryId: entryId || undefined, category: payment?.category, receiptAutoLinked: undefined, receiptOcrStatus: entryId ? 'linked' : 'needs-input', receiptOcrMessage: entryId ? undefined : '결제 날짜를 선택해 주세요.' });
  };
  const retryReceiptOcr = async (item: Evidence) => {
    try {
      const details = await recognizeReceiptDetails(item.file);
      update(item.id, { receiptDate: details.date, ...resolvedReceiptPatch(details) });
    } catch { update(item.id, { receiptOcrStatus: 'failed', receiptOcrMessage: '이미지에서 결제 날짜를 읽지 못했습니다. 날짜를 선택하거나 다시 읽어 주세요.' }); }
  };
  const linkAdditionalProof = (id: string, entryId: string) => { const payment = additionalProofPayments.find((entry) => entry.id === entryId); update(id, { linkedEntryId: entryId || undefined, category: payment?.category }); };
  const toggleStatementRow = (id: string, rowId: string) => onReportEvidenceChange((current) => current.map((item) => {
    if (item.id !== id) return item;
    const excluded = new Set(item.excludedStatementRowIds ?? []);
    if (excluded.has(rowId)) excluded.delete(rowId); else excluded.add(rowId);
    return { ...item, excludedStatementRowIds: [...excluded] };
  }));
  const retryStatementParse = async (item: Evidence) => {
    try {
      const password = statementPasswords[item.id];
      const rows = toStatementRows(await parseShinhanBankPdfExport(await item.file.arrayBuffer(), password || undefined));
      if (!rows.length) throw new Error('입출금 행을 찾지 못했습니다.');
      update(item.id, { statementRows: rows, excludedStatementRowIds: [], statementParseFailed: false, statementSourceRequiresPassword: Boolean(password) });
      setMessage('입출금내역 표를 읽었습니다. 사업과 무관한 행만 선택해 가릴 수 있습니다.');
    } catch {
      setMessage('입출금내역 표를 읽지 못했습니다. PDF 비밀번호와 파일 형식을 확인해 주세요.');
    }
  };
  const move = (section: ReportEvidenceSection, index: number, direction: -1 | 1) => onReportEvidenceChange((current) => { const ordered = current.filter((item) => item.section === section).sort((left, right) => left.order - right.order); const target = index + direction; if (target < 0 || target >= ordered.length) return current; const left = ordered[index]; const right = ordered[target]; return current.map((item) => item.id === left.id ? { ...item, order: right.order } : item.id === right.id ? { ...item, order: left.order } : item); });
  const remove = (item: Evidence) => { if (item.url) { URL.revokeObjectURL(item.url); urls.current.delete(item.url); } raster.current.delete(item.id); onReportEvidenceChange((current) => current.filter((record) => record.id !== item.id)); void removeStoredEvidence(item.stored).catch(() => undefined); };
  const rasterize = async (item: Evidence, profile: ExportProfile, onPage: () => void) => { const key = `${evidenceRasterCacheKey(item, profile.id)}:${periodKey}:${JSON.stringify(period)}:${item.statementSourceRequiresPassword ? 'protected' : 'open'}`; const cached = raster.current.get(key); if (cached) return cached; const hasSourceCoordinates = item.statementRows?.some((row) => row.sourcePage !== undefined && row.sourceY !== undefined); const output = item.section === 'statement' && item.kind === 'pdf' && hasSourceCoordinates ? await renderMaskedStatementPdf(item.file, item.statementRows ?? [], item.excludedStatementRowIds ?? [], profile, periodKey, onPage, () => cancelled.current, statementPasswords[item.id], period) : item.section === 'statement' && item.statementRows?.length ? await statementPages(item.statementRows, item.excludedStatementRowIds ?? [], profile.quality, periodKey, period) : item.kind === 'pdf' ? await renderPdf(item.file, profile.pdfDpi ?? 150, profile.quality, onPage, () => cancelled.current) : await compressImage(item.file, profile.maxEdge, profile.quality); raster.current.set(key, output); return output; };
  const addImages = async (pdf: any, images: RasterImage[]) => { for (const source of images) { if (cancelled.current) throw new ExportCancelled(); const image = await pdf.embedJpg(source.bytes); const page = pdf.addPage(A4); page.drawImage(image, fitImageInsidePage(source.width, source.height, A4[0], A4[1], 36)); } };
  const exportPdf = async (qualityComparison = false) => { if (!items.length) return; const unreadStatements = items.filter((item) => item.section === 'statement' && item.kind === 'pdf' && !item.statementRows?.length); if (unreadStatements.length > 0) { setMessage(`표를 읽지 못한 입출금내역 ${unreadStatements.length}개가 있습니다. 원본 개인정보 보호를 위해 비밀번호 입력 후 다시 읽어 주세요.`); return; } const protectedStatements = items.filter((item) => item.section === 'statement' && item.statementSourceRequiresPassword && !statementPasswords[item.id]); if (protectedStatements.length > 0) { setMessage(`원본 형식으로 제출하려면 보호된 입출금내역 ${protectedStatements.length}개의 PDF 비밀번호를 입력해 주세요. 비밀번호는 이 화면에서만 사용되고 저장되지 않습니다.`); return; } const sourcePages = items.reduce((sum, item) => sum + (item.pages ?? 1), 0); const categories = [...new Set(inSection('receipt').map(receiptCategory))] as string[]; const total = Math.max(1, sourcePages + categories.length + 1); cancelled.current = false; setExporting(true); setProgress({ current: 0, total, stage: qualityComparison ? '압축 품질 비교를 준비하고 있습니다' : '제출 파일을 준비하고 있습니다', attempt: 1 }); setMessage(null); try { const { PDFDocument } = await import('pdf-lib'); let bytes: Uint8Array<ArrayBufferLike> = new Uint8Array(); const comparisonResults: string[] = []; for (const [attempt, profile] of PROFILES.entries()) { if (cancelled.current) throw new ExportCancelled(); const pdf = await PDFDocument.create(); let done = 0; const status = (stage: string) => setProgress({ current: done, total, stage, attempt: attempt + 1 }); await addImages(pdf, [await pageImage(summary, profile.quality)]); done += 1; status('지원금 사용 요약을 만들고 있습니다'); for (const section of ['statement', 'transactionProof'] as const) for (const item of inSection(section)) { if (cancelled.current) throw new ExportCancelled(); const stage = profile.pdfDpi ? `용량을 최적화하고 있습니다 · ${attempt + 1}차` : `${LABEL[section]}을 추가하고 있습니다`; if (item.kind === 'pdf' && item.section !== 'statement' && !profile.pdfDpi && !item.statementRows?.length) { const source = await PDFDocument.load(await item.file.arrayBuffer()); const pages = await pdf.copyPages(source, source.getPageIndices()); pages.forEach((page: any) => pdf.addPage(page)); done += pages.length; status(stage); } else { const images = await rasterize(item, profile, () => { done += 1; status(stage); }); await addImages(pdf, images); if (item.kind === 'image') { done += 1; status(stage); } } } for (const category of categories) { if (cancelled.current) throw new ExportCancelled(); const label = category === '__unlinked__' ? '미연결 영수증' : summary.buckets.flatMap((bucket) => bucket.items).find((item) => item.category === category)?.label ?? '미분류'; await addImages(pdf, [await divider(label, profile.quality)]); done += 1; status('세부 항목별 영수증을 정리하고 있습니다'); for (const item of inSection('receipt').filter((candidate) => receiptCategory(candidate) === category)) { const images = await rasterize(item, profile, () => { done += 1; status('영수증을 최적화하고 있습니다'); }); await addImages(pdf, images); if (item.kind === 'image') { done += 1; status('영수증을 정리하고 있습니다'); } } } if (cancelled.current) throw new ExportCancelled(); bytes = await pdf.save({ useObjectStreams: true }); if (cancelled.current) throw new ExportCancelled(); if (qualityComparison) { if (bytes.byteLength > TARGET_BYTES) throw new Error(`${profile.id} 품질의 PDF가 5MB 제한을 넘습니다. 영수증 수나 불필요한 페이지를 줄여 다시 비교해 주세요.`); await saveFile(`shinhanhae_report_quality-${profile.id}.pdf`, bytes, 'application/pdf'); comparisonResults.push(`${profile.id} ${fileSize(bytes.byteLength)}`); setResultPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })); }); continue; } if (bytes.byteLength <= TARGET_BYTES) break; } if (qualityComparison) { setMessage(`압축 품질 비교 PDF 3개를 Downloads에 저장했습니다. ${comparisonResults.join(' · ')}`); return; } if (bytes.byteLength > TARGET_BYTES) throw new Error('선명도를 유지하면서 5MB 이하로 만들 수 없습니다. 원본이 너무 큰 경우 불필요한 페이지를 줄인 뒤 다시 생성해 주세요.'); setProgress((current) => current ? { ...current, stage: 'Downloads에 저장하고 있습니다' } : current); const result = await saveFile('shinhanhae_report_evidence.pdf', bytes, 'application/pdf'); setResultPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })); }); setMessage(`${result.fileName}을 ${result.relativePath}에 저장했습니다. ${fileSize(bytes.byteLength)}${receiptWarning ? ` · ${receiptWarning}` : ''}`); } catch (error) { setMessage(error instanceof ExportCancelled ? 'PDF 생성을 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.'); } finally { setExporting(false); setProgress(null); } };
  const inputFingerprint = receiptFingerprint(inSection('receipt').filter((item) => item.kind === 'image'));
  useEffect(() => { setBenchmarks({}); }, [inputFingerprint]);
  const runBenchmark = async (kind: 'legacy' | 'current') => {
    const receipts = inSection('receipt').filter((item) => item.kind === 'image');
    if (!receipts.length) { setMessage('알고리즘 비교에는 JPG·PNG·WEBP 영수증을 한 장 이상 추가해 주세요.'); return; }
    cancelled.current = false; setExporting(true); setMessage(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      const result = await measureBenchmark({
        kind, receipts, fingerprint: inputFingerprint, profiles: PROFILES, targetBytes: TARGET_BYTES,
        cancelled: () => cancelled.current, progress: setProgress,
        create: async () => {
          const pdf = await PDFDocument.create();
          return { add: async (receipt, profile) => { const images = await compressImage(receipt.file, profile.maxEdge, profile.quality); if (cancelled.current) throw new BenchmarkCancelled(); await addImages(pdf, images); }, save: () => pdf.save({ useObjectStreams: true }) };
        },
      });
      setBenchmarks((current) => ({ ...current, [kind]: result }));
    } catch (error) { setMessage(error instanceof BenchmarkCancelled || error instanceof ExportCancelled ? '시간 측정을 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : '알고리즘 측정에 실패했습니다.'); }
    finally { setExporting(false); setProgress(null); }
  };
  const statementDetails = (item: Evidence) => item.statementRows?.length ? <><details className="statement-redaction"><summary>입출금 {item.statementRows.length}행 · 제외 {item.excludedStatementRowIds?.length ?? 0}행</summary><div className="statement-redaction__rows">{item.statementRows.map((row) => <label className="statement-redaction__row" key={row.id}><input type="checkbox" checked={item.excludedStatementRowIds?.includes(row.id) ?? false} onChange={() => toggleStatementRow(item.id, row.id)} /><span><b>{row.date} {row.time}</b><small>{row.summary} · {row.merchant}</small></span><em>{won(row.withdrawal || row.deposit)}</em></label>)}</div></details>{item.statementSourceRequiresPassword && <label className="statement-source-password">제출용 원본 PDF 비밀번호<input aria-label={`${item.file.name} 제출용 PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /><small>원본 입출금내역의 제외 행을 회색으로 가려 생성할 때만 사용하며 저장하지 않습니다.</small></label>}{!item.statementRows.some((row) => row.sourcePage !== undefined && row.sourceY !== undefined) && <small className="statement-source-note">이전 형식으로 읽은 파일입니다. 원본 레이아웃 제출을 위해 파일을 다시 추가해 주세요.</small>}</> : null;
  const receiptStatus = (item: Evidence) => {
    // Old persisted status copy mentioned amount-based automatic matching. Do not
    // repeat those instructions after switching to date-only user selection.
    const currentMessage = item.receiptOcrMessage && !/금액|추천|자동/.test(item.receiptOcrMessage) ? item.receiptOcrMessage : undefined;
    if (item.linkedEntryId) return <div className="receipt-link-priority"><strong>결제 연결 완료</strong><small>날짜 변경 또는 결제 변경이 필요하면 아래에서 다시 선택해 주세요.</small></div>;
    if (item.receiptDate && !isValidReceiptDate(item.receiptDate)) return <div className="receipt-link-priority"><small>읽은 날짜 형식이 올바르지 않습니다. 날짜를 직접 선택하거나 다시 읽어 주세요.</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    if (item.receiptOcrStatus === 'failed' || item.receiptOcrStatus === 'needs-input') return <div className="receipt-link-priority"><small>{currentMessage ?? '결제 날짜를 읽지 못했습니다. 날짜를 선택해 주세요.'}</small><button type="button" onClick={() => void retryReceiptOcr(item)}>영수증 다시 읽기</button></div>;
    return <div className="receipt-link-priority"><small>{currentMessage ?? '결제 날짜를 선택하면 해당 날짜의 결제를 보여드립니다.'}</small></div>;
  };
  const totalBytes = useMemo(() => items.reduce((sum, item) => sum + item.file.size, 0), [items]); const pages = items.reduce((sum, item) => sum + (item.pages ?? 1), 0); const expected = '파일 크기와 기기 성능에 따라 달라집니다'; const percent = progress ? Math.min(100, Math.round(progress.current / Math.max(1, progress.total) * 100)) : 0;
  const section = (name: ReportEvidenceSection, text: string) => {
    const listed = inSection(name);
    return <section data-guide={name} className="evidence-group"><h3>{LABEL[name]} <span>{listed.length}개</span></h3><p>{text}</p>{name === 'receipt' && <section className="evidence-missing"><strong>영수증 연결 확인</strong><span>결제 {readiness.payments.length}건 · 연결 {readiness.linkedEntryIds.size}건 · 미연결 {readiness.missingReceipts.length}건</span>{receiptWarning && <small role="status">{receiptWarning}</small>}</section>}<label className="file-picker">{LABEL[name]} 파일 추가<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple disabled={exporting} onChange={(event) => { void addFiles(name, event.target.files); event.currentTarget.value = ''; }} /></label><div className="evidence-list">{listed.map((item, index) => {
      const receiptDate = name === 'receipt' && isValidReceiptDate(item.receiptDate) ? item.receiptDate : undefined;
      const sameDayPayments = receiptDate ? payments.filter((payment) => paymentDateInKorea(payment) === receiptDate && !reportEvidence.some((evidence) => evidence.section === 'receipt' && evidence.id !== item.id && evidence.linkedEntryId === payment.id)) : [];
      return <article key={item.id}>{item.url ? <button type="button" className="receipt-thumbnail" onClick={() => setPreviewReceipt(item)} aria-label={`${LABEL[name]} ${index + 1} 크게 보기`}><img src={item.url} alt={`${LABEL[name]} ${index + 1}`} /></button> : <div className="evidence-pdf-preview" aria-label={`${LABEL[name]} PDF`}>PDF</div>}<div className="evidence-content"><span>{item.file.name}</span>{name === 'statement' ? statementDetails(item) : null}{name === 'statement' && item.statementParseFailed ? <div className="statement-unread"><strong>표를 읽지 못했습니다</strong><small>원본 PDF는 제출서류에 포함되지 않습니다.</small><label>PDF 비밀번호<input aria-label={`${item.file.name} PDF 비밀번호`} type="password" value={statementPasswords[item.id] ?? ''} onChange={(event) => setStatementPasswords((current) => ({ ...current, [item.id]: event.target.value }))} /></label><button type="button" onClick={() => void retryStatementParse(item)}>표 다시 읽기</button></div> : null}{name === 'transactionProof' && <label className="evidence-link">추가 증빙 결제 연결 (주거비·교통비)<select aria-label={`거래증빙 ${index + 1} 결제 연결`} value={item.linkedEntryId ?? ''} onChange={(event) => linkAdditionalProof(item.id, event.target.value)}><option value="">선택하지 않음</option>{additionalProofPayments.map((payment) => <option key={payment.id} value={payment.id}>{new Date(payment.occurredAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {payment.merchant} · {won(payment.amount)}</option>)}</select></label>}{name === 'receipt' && <>{receiptStatus(item)}<label className="evidence-link">영수증 결제 날짜<input key={`receipt-date-${receiptDate ?? ''}`} aria-label={`영수증 ${index + 1} 날짜`} type="date" defaultValue={receiptDate ?? ''} onBlur={(event) => update(item.id, { receiptDate: event.target.value || undefined, receiptAutoLinked: undefined })} /></label>{receiptDate && !item.linkedEntryId && <div className="receipt-link-priority receipt-payment-candidates"><strong>{receiptDate} 결제 {sameDayPayments.length}건</strong>{sameDayPayments.length ? sameDayPayments.map((payment) => <button type="button" key={payment.id} onClick={() => linkReceipt(item.id, payment.id)}>{payment.merchant} · {won(payment.amount)} <small>{new Date(payment.occurredAt).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })} · 이 결제로 연결</small></button>) : <small>이 날짜에 연결 가능한 정책 기간 내 결제가 없습니다. 날짜를 바꾸거나 거래내역을 확인해 주세요.</small>}</div>}{item.linkedEntryId && <button type="button" className="receipt-unlink" onClick={() => linkReceipt(item.id, '')}>결제 연결 해제</button>}</>}</div><div className="evidence-order"><button type="button" disabled={exporting || index === 0} onClick={() => move(name, index, -1)}>위로</button><button type="button" disabled={exporting || index === listed.length - 1} onClick={() => move(name, index, 1)}>아래로</button><button type="button" disabled={exporting} onClick={() => remove(item)}>삭제</button></div></article>;
    })}</div></section>;
  };
  const improvement = compareBenchmarks(benchmarks.legacy, benchmarks.current);
  return <><section className="evidence-export"><p>지원금 사용 요약을 첫 장에 만들고, 이후 입출금내역·거래증빙·세부 항목별 영수증 순서로 정리합니다. 연결한 영수증은 세부 항목별로, 연결하지 않은 영수증은 별도로 모아 정리합니다.</p>{items.length > 0 && <section className="evidence-summary"><strong>제출 전 요약</strong><span>첨부 {items.length}개 · 원본 {Math.ceil(totalBytes / 1024 / 1024 * 10) / 10}MB</span><small>첫 장 요약 + 원본 {pages}장 · 소요 시간은 {expected}</small><small>컬러를 유지하며 5MB 이하로 최적화합니다.</small></section>}{section('statement', '은행 또는 카드사에서 받은 입출금·이용내역 파일을 먼저 넣어 주세요.')}{section('transactionProof', '주거비·교통비 결제를 보완할 계좌이체 확인서 등 자료가 있다면 해당 결제에 연결하세요.')}{section('receipt', '영수증에서 읽은 결제 날짜를 확인한 뒤, 같은 날짜의 결제를 한 번 눌러 연결하세요. OCR은 연결을 자동 확정하지 않습니다.')}{progress && <section className="evidence-progress" role="status"><strong>{progress.stage}</strong><span>{progress.current} / {progress.total}장 처리 완료 · {percent}%</span><i aria-hidden="true"><b style={{ width: `${percent}%` }} /></i><small>{progress.measuring ? '측정 횟수와 영수증 처리 장수는 별개입니다.' : expected}</small><button type="button" onClick={() => { cancelled.current = true; }}>생성 취소</button></section>}{message && <p className="evidence-message">{message}</p>}{resultPreviewUrl && <section className="evidence-result-preview"><strong>생성 결과</strong><button className="sheet-action" type="button" onClick={() => void openLatestSavedFile(resultPreviewUrl, 'application/pdf').catch(() => setMessage('PDF를 열지 못했습니다. Downloads/신청해 계산기에서 직접 열어 주세요.'))}>미리보기</button><small>기기에 설치된 PDF 앱에서 파일을 엽니다.</small></section>}{import.meta.env.MODE === 'internal' && <section className="evidence-benchmark"><strong>압축·알고리즘 검증 (내부 테스트)</strong><p>같은 영수증으로 과거 고화질 방식은 1회, 현재 단계형 방식은 3회 측정해 중앙값을 기록합니다.</p><button className="sheet-action" disabled={exporting || !items.length} onClick={() => void exportPdf(true)}>{exporting ? 'PDF 생성 중…' : '압축 품질 비교 생성'}</button><button className="sheet-action secondary-action" disabled={exporting} onClick={() => void runBenchmark('legacy')}>과거 방식 시간 측정</button><button className="sheet-action secondary-action" disabled={exporting} onClick={() => void runBenchmark('current')}>현재 방식 시간 측정</button>{(['legacy', 'current'] as const).map((kind) => benchmarks[kind] && <small key={kind}>{benchmarks[kind].label}: {benchmarks[kind].imageCount}장 · {(benchmarks[kind].elapsedMs / 1000).toFixed(2)}초 중앙값 · {Math.round(benchmarks[kind].outputBytes / 1024)}KB · {benchmarks[kind].sampleCount}회 측정</small>)}{improvement !== null && <p>{improvement} 처리 시간과 용량을 함께 비교해 주세요.</p>}</section>}<div className="evidence-export__actions"><button className="sheet-action" disabled={exporting || !items.length} onClick={() => void exportPdf()}>{exporting ? 'PDF 생성 중…' : 'PDF 생성'}</button></div></section>{guideOpen && <SpotlightGuide title="PDF 생성 도움말" steps={PDF_GUIDE_STEPS} onClose={() => setGuideOpen(false)} />}{previewReceipt?.url && <div className="receipt-preview-backdrop" role="dialog" aria-modal="true" aria-label="영수증 크게 보기" onClick={() => setPreviewReceipt(null)}><section className="receipt-preview" onClick={(event) => event.stopPropagation()}><button type="button" aria-label="영수증 미리보기 닫기" onClick={() => setPreviewReceipt(null)}>×</button><img src={previewReceipt.url} alt={`${previewReceipt.file.name} 크게 보기`} /><small>{previewReceipt.file.name}</small></section></div>}</>;
}
