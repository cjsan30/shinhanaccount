import { useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { saveAndShareFile } from '../native/fileExport';

type Group = 'resident' | 'study';
type Evidence = { id: string; file: File; url: string };
const A4: [number, number] = [595.28, 841.89];
const MAX_BYTES = 5 * 1024 * 1024;

async function compressImage(file: File, maxEdge: number, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d'); if (!context) throw new Error('이미지를 압축할 수 없습니다.');
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('이미지를 압축할 수 없습니다.')), 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}

export function EvidenceExport() {
  const [resident, setResident] = useState<Evidence[]>([]); const [study, setStudy] = useState<Evidence[]>([]);
  const [dragging, setDragging] = useState<{ group: Group; index: number } | null>(null); const [message, setMessage] = useState<string | null>(null); const [exporting, setExporting] = useState(false); const [progress, setProgress] = useState<{ current: number; total: number; stage: string } | null>(null);
  const totalBytes = useMemo(() => [...resident, ...study].reduce((sum, item) => sum + item.file.size, 0), [resident, study]);
  const update = (group: Group, action: (items: Evidence[]) => Evidence[]) => (group === 'resident' ? setResident : setStudy)(action);
  const addFiles = (group: Group, files: FileList | null) => { if (!files) return; const valid = [...files].filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)); if (valid.length !== files.length) setMessage('JPG, PNG, WEBP 이미지만 추가할 수 있습니다.'); update(group, (current) => [...current, ...valid.map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }))]); };
  const move = (group: Group, index: number, direction: -1 | 1) => update(group, (current) => { const next = [...current]; const target = index + direction; if (target < 0 || target >= next.length) return current; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const reorder = (group: Group, target: number) => { if (!dragging || dragging.group !== group || dragging.index === target) return; update(group, (current) => { const next = [...current]; const [item] = next.splice(dragging.index, 1); next.splice(target, 0, item); return next; }); setDragging(null); };
  const remove = (group: Group, item: Evidence) => { URL.revokeObjectURL(item.url); update(group, (current) => current.filter((candidate) => candidate.id !== item.id)); };
  const exportPdf = async () => { const items = [...resident, ...study]; if (!items.length) return; setExporting(true); setProgress({ current: 0, total: items.length, stage: '이미지를 준비하고 있습니다' }); setMessage(null); try { let maxEdge = 1800; let quality = .82; let pdfBytes: Uint8Array<ArrayBufferLike> = new Uint8Array(); for (let attempt = 0; attempt < 4; attempt += 1) { const pdf = await PDFDocument.create(); for (const [index, item] of items.entries()) { setProgress({ current: index + 1, total: items.length, stage: `이미지 압축 중${attempt ? ` · 용량 조정 ${attempt + 1}차` : ''}` }); const bytes = await compressImage(item.file, maxEdge, quality); const image = await pdf.embedJpg(bytes); const page = pdf.addPage(A4); const scale = Math.min(523 / image.width, 770 / image.height); page.drawImage(image, { x: (A4[0] - image.width * scale) / 2, y: (A4[1] - image.height * scale) / 2, width: image.width * scale, height: image.height * scale }); } setProgress({ current: items.length, total: items.length, stage: 'PDF를 합치고 있습니다' }); pdfBytes = await pdf.save({ useObjectStreams: true }); if (pdfBytes.byteLength <= MAX_BYTES) break; maxEdge = Math.round(maxEdge * .78); quality -= .12; } if (pdfBytes.byteLength > MAX_BYTES) throw new Error('이미지가 많아 5MB 이하로 줄이지 못했습니다. 이미지를 나누어 다시 시도해 주세요.'); setProgress({ current: items.length, total: items.length, stage: 'Documents 폴더에 저장 중입니다' }); await saveAndShareFile('shinhanhae_report_evidence.pdf', pdfBytes, 'application/pdf'); setMessage('Documents 폴더에 PDF를 저장했습니다.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.'); } finally { setExporting(false); setProgress(null); } };
  const renderGroup = (title: string, group: Group, items: Evidence[]) => <section className="evidence-group"><h3>{title} <span>{items.length}장</span></h3><p>여러 장을 한 번에 고른 뒤, 위로·아래로 버튼으로 순서를 조정하세요.</p><label className="file-picker">이미지 여러 장 추가<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => addFiles(group, event.target.files)} /></label><div className="evidence-list">{items.map((item, index) => <article key={item.id} draggable onDragStart={() => setDragging({ group, index })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(group, index)}><img src={item.url} alt={`${title} 증빙 ${index + 1}`} /><span>{index + 1}. {item.file.name}</span><div className="evidence-order"><button type="button" aria-label={`${title} 증빙 위로 이동`} disabled={index === 0} onClick={() => move(group, index, -1)}>위</button><button type="button" aria-label={`${title} 증빙 아래로 이동`} disabled={index === items.length - 1} onClick={() => move(group, index, 1)}>아래</button><button type="button" onClick={() => remove(group, item)}>삭제</button></div></article>)}</div></section>;
  const count = resident.length + study.length;
  return <section className="evidence-export"><p>증빙 내용을 해석하거나 자동 판정하지 않습니다. 사용자가 확인한 이미지를 정주비 먼저, 학습공간비 다음 순서로 한 PDF에 합칩니다.</p>{count > 0 && <section className="evidence-summary"><strong>제출 전 요약</strong><span>정주비 {resident.length}장 · 학습공간비 {study.length}장 · 총 {count}장</span><small>원본 이미지 {Math.ceil(totalBytes / 1024 / 1024 * 10) / 10}MB · PDF는 5MB 이하로 자동 압축됩니다.</small></section>}{renderGroup('정주비 증빙', 'resident', resident)}{renderGroup('학습공간비 증빙', 'study', study)}{progress && <p className="evidence-message" role="status">{progress.stage} · {progress.current}/{progress.total}장</p>}{message && <p className="evidence-message">{message}</p>}<button className="sheet-action" disabled={exporting || !count} onClick={() => void exportPdf()}>{exporting ? 'PDF 만드는 중…' : '5MB 이하 PDF 만들기'}</button></section>;
}
