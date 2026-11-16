import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { jpeg } from './render';
import { ExportCancelled } from './types';

/** Same resolution as the statement pages, so small receipt text can be checked by zooming in. */
const PREVIEW_DPI = 150;
const PREVIEW_QUALITY = .8;

/**
 * Draws the assembled PDF back into page images so the user can check it in the app
 * before it is saved. The bytes are copied because pdf.js takes ownership of its input,
 * and the same bytes are saved afterwards without rebuilding the PDF.
 */
export async function renderPreviewPages(bytes: Uint8Array, onPage: (done: number, total: number) => void, cancelled: () => boolean): Promise<Blob[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: bytes.slice() }); const source = await task.promise; const pages: Blob[] = [];
  try {
    for (let index = 1; index <= source.numPages; index += 1) {
      if (cancelled()) throw new ExportCancelled();
      const page = await source.getPage(index); const viewport = page.getViewport({ scale: PREVIEW_DPI / 72 });
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('미리보기 페이지를 준비하지 못했습니다.');
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(new Blob([await jpeg(canvas, PREVIEW_QUALITY) as unknown as BlobPart], { type: 'image/jpeg' }));
      canvas.width = 1; canvas.height = 1; page.cleanup(); onPage(index, source.numPages);
    }
  } finally { await task.destroy(); }
  return pages;
}
