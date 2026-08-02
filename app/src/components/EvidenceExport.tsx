import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';

type Group = 'resident' | 'study';
type Evidence = { id: string; file: File; url: string };

const A4: [number, number] = [595.28, 841.89];

export function EvidenceExport() {
  const [resident, setResident] = useState<Evidence[]>([]);
  const [study, setStudy] = useState<Evidence[]>([]);
  const [dragging, setDragging] = useState<{ group: Group; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (group: Group, action: (items: Evidence[]) => Evidence[]) =>
    (group === 'resident' ? setResident : setStudy)(action);

  const addFiles = (group: Group, files: FileList | null) => {
    if (!files) return;
    const unsupported = [...files].some((file) => !['image/jpeg', 'image/png'].includes(file.type));
    if (unsupported) setError('JPG 또는 PNG 이미지만 추가할 수 있습니다.');
    const items = [...files]
      .filter((file) => ['image/jpeg', 'image/png'].includes(file.type))
      .map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file) }));
    update(group, (current) => [...current, ...items]);
  };

  const reorder = (group: Group, target: number) => {
    if (!dragging || dragging.group !== group || dragging.index === target) return;
    update(group, (current) => {
      const next = [...current];
      const [item] = next.splice(dragging.index, 1);
      next.splice(target, 0, item);
      return next;
    });
    setDragging(null);
  };

  const remove = (group: Group, item: Evidence) => {
    URL.revokeObjectURL(item.url);
    update(group, (current) => current.filter((candidate) => candidate.id !== item.id));
  };

  const exportPdf = async () => {
    const items = [...resident, ...study];
    if (!items.length) return;
    const pdf = await PDFDocument.create();
    for (const item of items) {
      const bytes = await item.file.arrayBuffer();
      const image = item.file.type === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
      const page = pdf.addPage(A4);
      const scale = Math.min(523 / image.width, 770 / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, { x: (A4[0] - width) / 2, y: (A4[1] - height) / 2, width, height });
    }
    const pdfBytes = await pdf.save();
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = '지원금_제출증빙.pdf';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const renderGroup = (title: string, group: Group, items: Evidence[]) => (
    <section className="evidence-group">
      <h3>{title} <span>{items.length}장</span></h3>
      <label className="file-picker">이미지 여러 장 추가
        <input type="file" accept="image/jpeg,image/png" multiple onChange={(event) => addFiles(group, event.target.files)} />
      </label>
      <div className="evidence-list">
        {items.map((item, index) => (
          <article key={item.id} draggable onDragStart={() => setDragging({ group, index })} onDragOver={(event) => event.preventDefault()} onDrop={() => reorder(group, index)}>
            <img src={item.url} alt={title + ' 증빙 ' + (index + 1)} />
            <span>{index + 1}. {item.file.name}</span>
            <button type="button" onClick={() => remove(group, item)}>삭제</button>
          </article>
        ))}
      </div>
    </section>
  );

  return <section className="evidence-export">
    <p>정주비 이미지를 먼저, 학습공간비 이미지를 다음에 추가하세요. 각 영역에서 드래그해 순서를 바꾼 뒤 한 PDF로 만듭니다.</p>
    {renderGroup('정주비 증빙', 'resident', resident)}
    {renderGroup('학습공간비 증빙', 'study', study)}
    {error && <p className="evidence-error">{error}</p>}
    <button className="sheet-action" disabled={!resident.length && !study.length} onClick={() => void exportPdf()}>제출용 PDF 만들기</button>
  </section>;
}