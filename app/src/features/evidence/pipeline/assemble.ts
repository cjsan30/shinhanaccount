import type { PeriodScope } from '../../../domain/periodSelectors';
import type { ReportEvidenceRecord } from '../../../domain/reportEvidence';
import { compressImage, divider, pageImage, renderMaskedStatementPdf, renderPdf, statementPages } from './render';
import { A4, ExportCancelled, PROFILES, SECTION_LABEL, TARGET_BYTES, type ExportProfile, type RasterImage, type ReportSummary } from './types';

export type AssemblySource = Pick<ReportEvidenceRecord, 'id' | 'section' | 'statementRows' | 'excludedStatementRowIds' | 'statementSourceRequiresPassword'> & { file: File; kind: 'image' | 'pdf'; pages?: number };
export type AssemblyProgress = { current: number; total: number; stage: string; attempt: number };
export type ImagePlacement = { x: number; y: number; width: number; height: number };

export type EvidenceAssembly = {
  summary: ReportSummary;
  /** Statements, then transaction proofs, each in the user's order. */
  documents: AssemblySource[];
  /** One divider page per group, followed by its receipts. */
  receiptGroups: Array<{ label: string; receipts: AssemblySource[] }>;
  scope: PeriodScope;
  /** Statement PDF passwords by evidence id; used only while rendering. */
  passwords: Record<string, string>;
  /** Rendered pages survive between attempts and exports while the inputs are unchanged. */
  rasterCache: Map<string, RasterImage[]>;
  isCancelled: () => boolean;
  onProgress: (progress: AssemblyProgress) => void;
  /** Quality comparison: receives every profile's PDF instead of stopping at the first that fits. */
  onComparison?: (profileId: ExportProfile['id'], bytes: Uint8Array) => Promise<void>;
};

export function fitImageInsidePage(imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number, margin: number): ImagePlacement {
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error('이미지 크기가 올바르지 않습니다.');
  const availableWidth = Math.max(1, pageWidth - margin * 2);
  const availableHeight = Math.max(1, pageHeight - margin * 2);
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return { x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
}

// Statement pages are rendered after redaction. The rendered cache must change
// when a user excludes a row or successfully re-reads a password-protected PDF.
export function evidenceRasterCacheKey(item: Pick<ReportEvidenceRecord, 'id' | 'section' | 'statementRows' | 'excludedStatementRowIds'>, profileId: string) {
  if (item.section !== 'statement') return `${item.id}:${profileId}`;
  const rows = (item.statementRows ?? []).map((row) => [row.id, row.date, row.time, row.summary, row.withdrawal, row.deposit, row.merchant, row.balance ?? '', row.branch ?? '', row.sourcePage ?? '', row.sourceY ?? ''].join('~')).join('|');
  const excluded = [...(item.excludedStatementRowIds ?? [])].sort().join('|');
  return `${item.id}:${profileId}:${rows}:${excluded}`;
}

/** Adds each raster as its own A4 page, scaled to fit inside the margins. */
export async function addRasterPages(pdf: any, images: RasterImage[], isCancelled: () => boolean) {
  for (const source of images) {
    if (isCancelled()) throw new ExportCancelled();
    const image = await pdf.embedJpg(source.bytes);
    const page = pdf.addPage(A4);
    page.drawImage(image, fitImageInsidePage(source.width, source.height, A4[0], A4[1], 36));
  }
}

async function rasterize(input: EvidenceAssembly, item: AssemblySource, profile: ExportProfile, onPage: () => void) {
  const { scope, rasterCache, isCancelled } = input;
  const key = `${evidenceRasterCacheKey(item, profile.id)}:${scope.periodKey}:${JSON.stringify(scope.period)}:${item.statementSourceRequiresPassword ? 'protected' : 'open'}`;
  const cached = rasterCache.get(key);
  if (cached) return cached;
  const hasSourceCoordinates = item.statementRows?.some((row) => row.sourcePage !== undefined && row.sourceY !== undefined);
  const output = item.section === 'statement' && item.kind === 'pdf' && hasSourceCoordinates
    ? await renderMaskedStatementPdf(item.file, item.statementRows ?? [], item.excludedStatementRowIds ?? [], profile, scope.periodKey, onPage, isCancelled, input.passwords[item.id], scope.period)
    : item.section === 'statement' && item.statementRows?.length
      ? await statementPages(item.statementRows, item.excludedStatementRowIds ?? [], profile.quality, scope.periodKey, scope.period)
      : item.kind === 'pdf'
        ? await renderPdf(item.file, profile.pdfDpi ?? 150, profile.quality, onPage, isCancelled)
        : await compressImage(item.file, profile.maxEdge, profile.quality);
  rasterCache.set(key, output);
  return output;
}

/**
 * Builds the submission PDF: summary, statements and transaction proofs, then
 * receipts grouped by item. Each profile is tried in turn until the file fits
 * under the size target. Saving and messages stay with the caller.
 */
export async function assembleEvidencePdf(input: EvidenceAssembly): Promise<Uint8Array> {
  const { summary, documents, receiptGroups, isCancelled, onProgress, onComparison } = input;
  const receipts = receiptGroups.flatMap((group) => group.receipts);
  const sourcePages = [...documents, ...receipts].reduce((sum, item) => sum + (item.pages ?? 1), 0);
  const total = Math.max(1, sourcePages + receiptGroups.length + 1);
  onProgress({ current: 0, total, stage: onComparison ? '압축 품질 비교를 준비하고 있습니다' : '제출 파일을 준비하고 있습니다', attempt: 1 });
  const { PDFDocument } = await import('pdf-lib');
  let bytes: Uint8Array = new Uint8Array();
  for (const [attempt, profile] of PROFILES.entries()) {
    if (isCancelled()) throw new ExportCancelled();
    const pdf = await PDFDocument.create();
    let done = 0;
    const status = (stage: string) => onProgress({ current: done, total, stage, attempt: attempt + 1 });
    await addRasterPages(pdf, [await pageImage(summary, profile.quality)], isCancelled);
    done += 1;
    status('지원금 사용 요약을 만들고 있습니다');
    for (const item of documents) {
      if (isCancelled()) throw new ExportCancelled();
      const stage = profile.pdfDpi ? `용량을 최적화하고 있습니다 · ${attempt + 1}차` : `${SECTION_LABEL[item.section]}을 추가하고 있습니다`;
      if (item.kind === 'pdf' && item.section !== 'statement' && !profile.pdfDpi && !item.statementRows?.length) {
        const source = await PDFDocument.load(await item.file.arrayBuffer());
        const pages = await pdf.copyPages(source, source.getPageIndices());
        pages.forEach((page) => pdf.addPage(page));
        done += pages.length;
        status(stage);
      } else {
        const images = await rasterize(input, item, profile, () => { done += 1; status(stage); });
        await addRasterPages(pdf, images, isCancelled);
        if (item.kind === 'image') { done += 1; status(stage); }
      }
    }
    for (const group of receiptGroups) {
      if (isCancelled()) throw new ExportCancelled();
      await addRasterPages(pdf, [await divider(group.label, profile.quality)], isCancelled);
      done += 1;
      status('세부 항목별 영수증을 정리하고 있습니다');
      for (const item of group.receipts) {
        const images = await rasterize(input, item, profile, () => { done += 1; status('영수증을 최적화하고 있습니다'); });
        await addRasterPages(pdf, images, isCancelled);
        if (item.kind === 'image') { done += 1; status('영수증을 정리하고 있습니다'); }
      }
    }
    if (isCancelled()) throw new ExportCancelled();
    bytes = await pdf.save({ useObjectStreams: true });
    if (isCancelled()) throw new ExportCancelled();
    if (onComparison) {
      if (bytes.byteLength > TARGET_BYTES) throw new Error(`${profile.id} 품질의 PDF가 5MB 제한을 넘습니다. 영수증 수나 불필요한 페이지를 줄여 다시 비교해 주세요.`);
      await onComparison(profile.id, bytes);
      continue;
    }
    if (bytes.byteLength <= TARGET_BYTES) break;
  }
  if (!onComparison && bytes.byteLength > TARGET_BYTES) throw new Error('선명도를 유지하면서 5MB 이하로 만들 수 없습니다. 원본이 너무 큰 경우 불필요한 페이지를 줄인 뒤 다시 생성해 주세요.');
  return bytes;
}
