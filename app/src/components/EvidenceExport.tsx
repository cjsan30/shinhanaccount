import { useEffect, useMemo, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { saveFile } from '../native/fileExport';
import { fitImageInsidePage } from '../features/evidence/imageLayout';

type Group = 'resident' | 'study';
type EvidenceKind = 'image' | 'pdf';
type Evidence = { id: string; file: File; kind: EvidenceKind; url?: string; pages?: number };
type RasterImage = { bytes: Uint8Array; width: number; height: number };
type ExportProfile = { id: 'default' | 'compact' | 'minimum'; maxEdge: number; quality: number; pdfDpi: number | null };
type Progress = { current: number; total: number; stage: string; attempt: number };

const A4: [number, number] = [595.28, 841.89];
const TARGET_BYTES = Math.floor(4.7 * 1024 * 1024);
const PROFILES: ExportProfile[] = [
  { id: 'default', maxEdge: 1024, quality: .58, pdfDpi: null },
  { id: 'compact', maxEdge: 920, quality: .5, pdfDpi: 150 },
  { id: 'minimum', maxEdge: 800, quality: .42, pdfDpi: 120 },
];

class ExportCancelled extends Error {}

function durationLabel(seconds: number) {
  if (seconds <= 25) return '약 30초 내외';
  if (seconds <= 60) return '약 1분 내외';
  return '약 1~2분';
}

function estimateSeconds(items: Evidence[]) {
  return Math.max(15, Math.round(8 + items.reduce((sum, item) => sum + (item.kind === 'pdf' ? (item.pages ?? 2) : 1), 0) * .7));
}

function supportsEvidence(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
}

function kindOf(file: File): EvidenceKind {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name) ? 'pdf' : 'image';
}

async function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('이미지를 압축하지 못했습니다.')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

async function compressImage(file: File, maxEdge: number, quality: number): Promise<RasterImage[]> {
  const bitmap = await createImageBitmap(file);
  const shouldSplit = bitmap.height / bitmap.width > 2.1;
  const sourceSegmentHeight = shouldSplit ? Math.ceil(bitmap.width / .68) : bitmap.height;
  const overlap = shouldSplit ? Math.min(48, Math.round(bitmap.width * .04)) : 0;
  const targetWidth = Math.min(bitmap.width, maxEdge);
  const output: RasterImage[] = [];
  try {
    for (let top = 0; top < bitmap.height; top += Math.max(1, sourceSegmentHeight - overlap)) {
      const sourceHeight = Math.min(sourceSegmentHeight, bitmap.height - top);
      const targetHeight = Math.max(1, Math.round(sourceHeight * targetWidth / bitmap.width));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth; canvas.height = targetHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('이미지를 압축하지 못했습니다.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(bitmap, 0, top, bitmap.width, sourceHeight, 0, 0, targetWidth, targetHeight);
      const bytes = await canvasToJpeg(canvas, quality);
      output.push({ bytes, width: targetWidth, height: targetHeight });
      canvas.width = 1; canvas.height = 1;
      if (!shouldSplit) break;
    }
  } finally {
    bitmap.close();
  }
  return output;
}

async function renderPdfPages(file: File, dpi: number, quality: number, onPage: () => void, cancelled: () => boolean): Promise<RasterImage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const source = await loadingTask.promise;
  const result: RasterImage[] = [];
  try {
    for (let number = 1; number <= source.numPages; number += 1) {
      if (cancelled()) throw new ExportCancelled();
      const page = await source.getPage(number);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('PDF 페이지를 준비하지 못했습니다.');
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const bytes = await canvasToJpeg(canvas, quality);
      result.push({ bytes, width: canvas.width, height: canvas.height });
      canvas.width = 1; canvas.height = 1;
      page.cleanup();
      onPage();
    }
  } finally {
    await loadingTask.destroy();
  }
  return result;
}

async function inspectPdfPageCount(file: File) {
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await file.arrayBuffer());
  return source.getPageCount();
}

export function EvidenceExport() {
  const [resident, setResident] = useState<Evidence[]>([]);
  const [study, setStudy] = useState<Evidence[]>([]);
  const [dragging, setDragging] = useState<{ group: Group; index: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const previewUrls = useRef(new Set<string>());
  const rasterCache = useRef(new Map<string, RasterImage[]>());
  const cancelRequested = useRef(false);
  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);
  useEffect(() => {
    let disposed = false;
    const scan = async () => {
      const pending = [...resident, ...study].filter((item) => item.kind === 'pdf' && !item.pages);
      await Promise.all(pending.map(async (item) => {
        let pages = 1;
        try { pages = await inspectPdfPageCount(item.file); } catch { /* the export path reports the readable error */ }
        if (disposed) return;
        const updateCount = (entries: Evidence[]) => entries.map((entry) => entry.id === item.id ? { ...entry, pages } : entry);
        setResident(updateCount); setStudy(updateCount);
      }));
    };
    void scan();
    return () => { disposed = true; };
  }, [resident, study]);
  const totalBytes = useMemo(() => [...resident, ...study].reduce((sum, item) => sum + item.file.size, 0), [resident, study]);
  const update = (group: Group, action: (items: Evidence[]) => Evidence[]) => (group === 'resident' ? setResident : setStudy)(action);
  const addFiles = (group: Group, files: FileList | null) => {
    if (!files) return;
    const valid = [...files].filter(supportsEvidence);
    if (valid.length !== files.length) setMessage('JPG, PNG, WEBP, PDF 파일만 추가할 수 있습니다.');
    update(group, (current) => [...current, ...valid.map((file) => {
      const kind = kindOf(file);
      const url = kind === 'image' ? URL.createObjectURL(file) : undefined;
      if (url) previewUrls.current.add(url);
      return { id: crypto.randomUUID(), file, kind, url, pages: kind === 'image' ? 1 : undefined };
    })]);
  };
  const move = (group: Group, index: number, direction: -1 | 1) => update(group, (current) => {
    const next = [...current]; const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const reorder = (group: Group, target: number) => {
    if (!dragging || dragging.group !== group || dragging.index === target) return;
    update(group, (current) => { const next = [...current]; const [item] = next.splice(dragging.index, 1); next.splice(target, 0, item); return next; });
    setDragging(null);
  };
  const remove = (group: Group, item: Evidence) => {
    if (item.url) { URL.revokeObjectURL(item.url); previewUrls.current.delete(item.url); }
    rasterCache.current.delete(item.id);
    update(group, (current) => current.filter((candidate) => candidate.id !== item.id));
  };
  const clearPreviews = () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear(); rasterCache.current.clear();
    setResident([]); setStudy([]);
  };
  const rasterize = async (item: Evidence, profile: ExportProfile, onPage: () => void) => {
    const cacheKey = `${item.id}:${profile.id}`;
    const cached = rasterCache.current.get(cacheKey);
    if (cached) return cached;
    const output = item.kind === 'pdf'
      ? await renderPdfPages(item.file, profile.pdfDpi ?? 150, profile.quality, onPage, () => cancelRequested.current)
      : await compressImage(item.file, profile.maxEdge, profile.quality);
    rasterCache.current.set(cacheKey, output);
    return output;
  };
  const exportPdf = async () => {
    const items = [...resident, ...study];
    if (!items.length) return;
    const unitCount = items.reduce((sum, item) => sum + (item.pages ?? 1), 0);
    cancelRequested.current = false;
    setExporting(true); setProgress({ current: 0, total: unitCount, stage: '제출 파일을 준비하고 있습니다', attempt: 1 }); setMessage(null);
    try {
      const { PDFDocument } = await import('pdf-lib');
      let pdfBytes: Uint8Array<ArrayBufferLike> = new Uint8Array();
      for (const [profileIndex, profile] of PROFILES.entries()) {
        const pdf = await PDFDocument.create();
        let processed = unitCount * profileIndex;
        const updateProgress = (stage: string) => setProgress({ current: processed, total: unitCount * (profileIndex + 1), stage, attempt: profileIndex + 1 });
        for (const item of items) {
          if (cancelRequested.current) throw new ExportCancelled();
          const stage = profile.pdfDpi ? `용량을 최적화하고 있습니다 · ${profileIndex + 1}차` : '이미지를 압축하고 있습니다';
          if (item.kind === 'pdf' && !profile.pdfDpi) {
            const source = await PDFDocument.load(await item.file.arrayBuffer());
            const pages = await pdf.copyPages(source, source.getPageIndices());
            pages.forEach((page) => { pdf.addPage(page); processed += 1; updateProgress(stage); });
            continue;
          }
          const images = await rasterize(item, profile, () => { processed += 1; updateProgress(stage); });
          for (const imageBytes of images) {
            const image = await pdf.embedJpg(imageBytes.bytes);
            const page = pdf.addPage(A4);
            page.drawImage(image, fitImageInsidePage(imageBytes.width, imageBytes.height, A4[0], A4[1], 36));
          }
          if (item.kind === 'image') { processed += 1; updateProgress(stage); }
        }
        updateProgress('PDF를 합치고 있습니다');
        pdfBytes = await pdf.save({ useObjectStreams: true });
        if (pdfBytes.byteLength <= TARGET_BYTES) break;
      }
      if (pdfBytes.byteLength > TARGET_BYTES) throw new Error('선명도를 유지하면서 5MB 이하로 만들 수 없습니다. 불필요한 이미지를 줄인 뒤 다시 시도해 주세요.');
      setProgress((current) => current ? { ...current, stage: 'Downloads에 저장하고 있습니다' } : current);
      const result = await saveFile('shinhanhae_report_evidence.pdf', pdfBytes, 'application/pdf');
      setMessage(`${result.fileName}을 ${result.relativePath}에 저장했습니다.`);
      clearPreviews();
    } catch (error) { setMessage(error instanceof ExportCancelled ? 'PDF 생성을 취소했습니다. 선택한 파일은 그대로 유지됩니다.' : error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.'); }
    finally { setExporting(false); setProgress(null); }
  };
  const renderGroup = (title: string, group: Group, items: Evidence[]) => <section className="evidence-group"><h3>{title} <span>{items.length}장</span></h3><p>이미지 또는 PDF를 여러 장 고른 뒤, 위·아래 버튼 또는 드래그로 순서를 조정하세요.</p><label className="file-picker">증빙 파일 여러 장 추가<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple onChange={(event) => addFiles(group, event.target.files)} /></label><div className="evidence-list">{items.map((item, index) => <article key={item.id} draggable onDragStart={() => setDragging({ group, index })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(group, index)}>{item.url ? <img src={item.url} alt={`${title} 증빙 ${index + 1}`} /> : <div className="evidence-pdf-preview" aria-label={`${title} PDF 증빙`}>PDF</div>}<span>{index + 1}. {item.file.name}</span><div className="evidence-order"><button type="button" aria-label={`${title} 증빙 위로 이동`} disabled={index === 0} onClick={() => move(group, index, -1)}>위로</button><button type="button" aria-label={`${title} 증빙 아래로 이동`} disabled={index === items.length - 1} onClick={() => move(group, index, 1)}>아래로</button><button type="button" onClick={() => remove(group, item)}>삭제</button></div></article>)}</div></section>;
  const residentPages = resident.reduce((sum, item) => sum + (item.pages ?? 1), 0);
  const studyPages = study.reduce((sum, item) => sum + (item.pages ?? 1), 0);
  const count = resident.length + study.length;
  const pageCount = residentPages + studyPages;
  const items = [...resident, ...study];
  const expected = durationLabel(estimateSeconds(items));
  const progressPercent = progress ? Math.min(100, Math.round(progress.current / Math.max(1, progress.total) * 100)) : 0;
  return <section className="evidence-export"><p>증빙 내용을 해석하거나 자동 판정하지 않습니다. 정주비를 먼저, 학습공간비를 다음 순서로 한 PDF에 합칩니다. 컬러는 유지하면서 5MB 이하로 최적화합니다.</p>{count > 0 && <section className="evidence-summary"><strong>제출 전 요약</strong><span>정주비 {residentPages}장 · 학습공간비 {studyPages}장 · 총 {pageCount}장</span><small>원본 파일 {Math.ceil(totalBytes / 1024 / 1024 * 10) / 10}MB · PDF와 이미지를 함께 추가할 수 있습니다.</small><small>예상 소요 시간 {expected} · 생성 중에는 앱을 열어 두면 안정적으로 완료됩니다.</small></section>}{renderGroup('정주비 증빙', 'resident', resident)}{renderGroup('학습공간비 증빙', 'study', study)}{progress && <section className="evidence-progress" role="status"><strong>{progress.stage}</strong><span>증빙 {progress.current} / {progress.total}장 처리 완료 · {progressPercent}%</span><i aria-hidden="true"><b style={{ width: `${progressPercent}%` }} /></i><small>{progress.attempt > 1 ? '추가 최적화 중입니다. 약 30초~1분 더 걸릴 수 있어요.' : `예상 완료 ${expected}`}</small><button type="button" onClick={() => { cancelRequested.current = true; }}>생성 취소</button></section>}{message && <p className="evidence-message">{message}</p>}<button className="sheet-action" disabled={exporting || !count} onClick={() => void exportPdf()}>{exporting ? 'PDF 생성 중…' : 'PDF 생성'}</button></section>;
}
