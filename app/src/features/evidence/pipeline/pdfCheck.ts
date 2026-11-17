import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { pdfOpenFailure, type PdfOpenCheck } from '../../../domain/pdfOpenCheck';

/** Opens only the document, without drawing pages, so a locked or broken PDF is caught when it is attached. */
export async function checkPdfOpens(file: Blob, password?: string): Promise<PdfOpenCheck> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), ...(password ? { password } : {}) });
  try {
    await task.promise;
    return 'open';
  } catch (error) {
    return pdfOpenFailure(error);
  } finally {
    await task.destroy();
  }
}
