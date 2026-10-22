import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TARGET_BYTES, type RasterImage } from './types';

const raster = (tag: string): RasterImage => ({ bytes: new TextEncoder().encode(tag), width: 100, height: 200 });
const { renderMocks, pdfState } = vi.hoisted(() => ({
  renderMocks: {
    pageImage: vi.fn(), divider: vi.fn(), compressImage: vi.fn(), renderPdf: vi.fn(), renderMaskedStatementPdf: vi.fn(), statementPages: vi.fn(),
  },
  pdfState: { saveSizes: [] as number[], documents: [] as string[][] },
}));
vi.mock('./render', () => renderMocks);
vi.mock('pdf-lib', () => ({
  PDFDocument: {
    create: vi.fn(async () => {
      const pages: string[] = [];
      pdfState.documents.push(pages);
      return {
        embedJpg: async (bytes: Uint8Array) => new TextDecoder().decode(bytes),
        addPage: (page: unknown) => {
          if (typeof page === 'string') { pages.push(page); return undefined; }
          return { drawImage: (image: string) => pages.push(image) };
        },
        copyPages: async (_source: unknown, indices: number[]) => indices.map((index) => `copied:${index}`),
        save: async () => new Uint8Array(pdfState.saveSizes.shift() ?? 1000),
      };
    }),
    load: vi.fn(async () => ({ getPageIndices: () => [0, 1] })),
  },
}));
import { assembleEvidencePdf, evidenceRasterCacheKey, fitImageInsidePage, type AssemblySource, type EvidenceAssembly } from './assemble';
import { ExportCancelled } from './types';

const file = (name: string) => ({ name, arrayBuffer: async () => new ArrayBuffer(4) }) as File;
const summary = { periodLabel: '2026-09', totalBudget: 0, totalUsed: 0, buckets: [] };
const statement: AssemblySource = { id: 's1', section: 'statement', kind: 'pdf', file: file('bank.pdf'), statementRows: [{ id: 'r1', date: '2026-09-20', time: '12:00:00', summary: '', withdrawal: 1000, deposit: 0, merchant: 'x', sourcePage: 0, sourceY: 100 }] };
const proofPdf: AssemblySource = { id: 'p1', section: 'transactionProof', kind: 'pdf', file: file('proof.pdf'), pages: 2 };
const receipt = (id: string): AssemblySource => ({ id, section: 'receipt', kind: 'image', file: file(`${id}.jpg`) });
const input = (patch: Partial<EvidenceAssembly> = {}): EvidenceAssembly => ({
  summary, documents: [statement, proofPdf], receiptGroups: [{ label: '식비', receipts: [receipt('rc1'), receipt('rc2')] }],
  scope: { periodKey: '2026-09' }, passwords: { s1: 'pw' }, rasterCache: new Map(), isCancelled: () => false, onProgress: vi.fn(), ...patch,
});

beforeEach(() => {
  vi.clearAllMocks();
  pdfState.saveSizes = []; pdfState.documents = [];
  renderMocks.pageImage.mockImplementation(async () => raster('summary'));
  renderMocks.divider.mockImplementation(async (label: string) => raster(`divider:${label}`));
  renderMocks.compressImage.mockImplementation(async (source: File) => [raster(`image:${source.name}`)]);
  renderMocks.renderPdf.mockImplementation(async (source: File, _dpi: number, _quality: number, onPage: () => void) => { onPage(); onPage(); return [raster(`pdf:${source.name}:1`), raster(`pdf:${source.name}:2`)]; });
  renderMocks.renderMaskedStatementPdf.mockImplementation(async (source: File, ...rest: unknown[]) => { (rest[4] as () => void)(); return [raster(`masked:${source.name}`)]; });
  renderMocks.statementPages.mockImplementation(async () => [raster('statement-table')]);
});

describe('evidence image placement', () => {
  it('keeps a normal camera photo fully inside the page without cropping', () => {
    const placed = fitImageInsidePage(4032, 3024, 595.28, 841.89, 36);
    expect(placed.x).toBeGreaterThanOrEqual(36);
    expect(placed.y).toBeGreaterThanOrEqual(36);
    expect(placed.x + placed.width).toBeLessThanOrEqual(595.28 - 36 + 0.001);
    expect(placed.y + placed.height).toBeLessThanOrEqual(841.89 - 36 + 0.001);
    expect(placed.width / placed.height).toBeCloseTo(4032 / 3024);
  });

  it('keeps a long scanned receipt fully inside the page without changing its ratio', () => {
    const placed = fitImageInsidePage(1080, 6000, 595.28, 841.89, 36);
    expect(placed.height).toBeCloseTo(841.89 - 72);
    expect(placed.width / placed.height).toBeCloseTo(1080 / 6000);
  });
});

describe('evidence PDF assembly', () => {
  it('puts the summary, statements, proofs and grouped receipts in order', async () => {
    await assembleEvidencePdf(input());
    expect(pdfState.documents[0]).toEqual(['summary', 'masked:bank.pdf', 'copied:0', 'copied:1', 'divider:식비', 'image:rc1.jpg', 'image:rc2.jpg']);
    expect(renderMocks.renderMaskedStatementPdf.mock.calls[0][7]).toBe('pw');
  });

  it('reports progress from zero up to every source page plus the summary and dividers', async () => {
    const onProgress = vi.fn();
    await assembleEvidencePdf(input({ onProgress }));
    const calls = onProgress.mock.calls.map(([progress]) => progress);
    expect(calls[0]).toEqual({ current: 0, total: 1 + 2 + 1 + 1 + 2, stage: '제출 파일을 준비하고 있습니다', attempt: 1 });
    expect(calls.at(-1)).toMatchObject({ current: 1 + 1 + 2 + 1 + 2, attempt: 1, stage: '영수증을 정리하고 있습니다' });
  });

  it('falls back to smaller profiles until the file fits and rasterizes proofs once compressing', async () => {
    pdfState.saveSizes = [TARGET_BYTES + 1, TARGET_BYTES];
    const bytes = await assembleEvidencePdf(input());
    expect(bytes.byteLength).toBe(TARGET_BYTES);
    expect(pdfState.documents).toHaveLength(2);
    expect(pdfState.documents[1]).toContain('pdf:proof.pdf:1');
    expect(renderMocks.renderPdf.mock.calls[0][1]).toBe(150);
  });

  it('fails with a clear message when no profile fits', async () => {
    pdfState.saveSizes = [TARGET_BYTES + 1, TARGET_BYTES + 1, TARGET_BYTES + 1];
    await expect(assembleEvidencePdf(input())).rejects.toThrow('5MB 이하로 만들 수 없습니다');
  });

  it('hands every profile to a quality comparison and stops if one is too large', async () => {
    const onComparison = vi.fn(async (_profileId: string, _bytes: Uint8Array) => undefined);
    await assembleEvidencePdf(input({ onComparison }));
    expect(onComparison.mock.calls.map(([profileId]) => profileId)).toEqual(['default', 'compact', 'minimum']);
    pdfState.saveSizes = [1000, TARGET_BYTES + 1];
    await expect(assembleEvidencePdf(input({ onComparison: vi.fn(async () => undefined) }))).rejects.toThrow('compact 품질의 PDF가 5MB 제한을 넘습니다');
  });

  it('stops between pages when cancelled', async () => {
    let calls = 0;
    await expect(assembleEvidencePdf(input({ isCancelled: () => ++calls > 2 }))).rejects.toBeInstanceOf(ExportCancelled);
    expect(renderMocks.compressImage).not.toHaveBeenCalled();
  });

  it('reuses rendered pages for unchanged inputs', async () => {
    const rasterCache = new Map();
    await assembleEvidencePdf(input({ rasterCache }));
    await assembleEvidencePdf(input({ rasterCache }));
    expect(renderMocks.compressImage).toHaveBeenCalledTimes(2);
    expect(renderMocks.renderMaskedStatementPdf).toHaveBeenCalledTimes(1);
  });

  it('changes the statement cache key when rows are excluded', () => {
    expect(evidenceRasterCacheKey(statement, 'default')).not.toBe(evidenceRasterCacheKey({ ...statement, excludedStatementRowIds: ['r1'] }, 'default'));
    expect(evidenceRasterCacheKey(receipt('rc1'), 'default')).toBe('rc1:default');
  });
});
