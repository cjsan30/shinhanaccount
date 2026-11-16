import { useLayoutEffect, useState } from 'react';
import { Sentences } from '../../components/Sentences';

type PdfPreviewProps = { pages: string[]; sizeLabel: string; saving: boolean; error: string | null; onClose: () => void; onSave: () => void };

/** Full-screen check of the assembled PDF; nothing is saved until [이대로 PDF 생성]. */
export function PdfPreview({ pages, sizeLabel, saving, error, onClose, onSave }: PdfPreviewProps) {
  const [zoomed, setZoomed] = useState<number | null>(null);
  // Android back closes only the preview (App.tsx sends this event), not the whole report sheet.
  // Attached as the preview is drawn, so a back press right after it appears is not missed.
  useLayoutEffect(() => {
    const close = () => { if (!saving) onClose(); };
    window.addEventListener('close-pdf-preview', close);
    return () => window.removeEventListener('close-pdf-preview', close);
  }, [saving, onClose]);
  return <div className="pdf-preview" role="dialog" aria-modal="true" aria-label="PDF 미리보기">
    <header className="pdf-preview__header"><strong>미리보기</strong><span>{pages.length}쪽 · {sizeLabel}</span></header>
    <div className="pdf-preview__pages">{pages.map((url, index) => <figure key={url} className={zoomed === index ? 'pdf-preview__page is-zoomed' : 'pdf-preview__page'}>
      <button type="button" aria-label={`${index + 1}쪽 ${zoomed === index ? '원래 크기로 보기' : '크게 보기'}`} onClick={() => setZoomed((current) => current === index ? null : index)}><img src={url} alt={`${index + 1}쪽`} /></button>
      <figcaption>{index + 1} / {pages.length}</figcaption>
    </figure>)}</div>
    <footer className="pdf-preview__footer">
      {error && <p role="alert"><Sentences text={error} /></p>}
      <div><button type="button" className="pdf-preview__close" disabled={saving} onClick={onClose}>닫기</button><button type="button" className="pdf-preview__save" disabled={saving} onClick={onSave}>{saving ? '저장 중…' : '이대로 PDF 생성'}</button></div>
    </footer>
  </div>;
}
