import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEvidence } from '../../native/evidenceVault';
import { ReceiptOcr } from '../../native/receiptOcr';
import { EvidenceExport } from './EvidenceExport';
import { evidenceRasterCacheKey } from './pipeline/assemble';
import { parseShinhanBankPdfExport } from '../../domain/shinhanBankImport';
import { adjustBudget } from '../../domain/budgetAdjustment';
import { emptyPolicy, getCategoryLimit, getPolicyItems, getPolicyLimit } from '../../domain/policy';

vi.mock('../../native/evidenceVault', () => ({
  loadEvidence: vi.fn(async (stored: { fileName: string; mimeType: string }) => new File(['receipt'], stored.fileName, { type: stored.mimeType })),
  removeStoredEvidence: vi.fn(),
  storeEvidence: vi.fn(async (file: File) => ({ id: 'stored-upload', fileName: file.name, mimeType: file.type, size: file.size, attachedAt: '2026-09-29T00:00:00+09:00' })),
}));
const exportMocks = vi.hoisted(() => ({ saveFile: vi.fn(), create: vi.fn(), load: vi.fn() }));
vi.mock('../../native/fileExport', () => ({ saveFile: exportMocks.saveFile, bytesToBase64: () => 'local-test-image' }));
vi.mock('../../native/receiptOcr', () => ({ ReceiptOcr: { recognize: vi.fn(async () => ({ text: '결제일시 2026-09-20 12:00:00' })) } }));
vi.mock('pdf-lib', () => ({ PDFDocument: { create: exportMocks.create, load: exportMocks.load } }));
vi.mock('../../domain/shinhanBankImport', () => ({
  parseShinhanBankPdfExport: vi.fn(async () => [{ source: 'bankCsv', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '개인 결제처', summary: '체크카드', amount: 12000, balance: 683000, transactionId: 'row-1', direction: 'withdrawal' }]),
}));

const summary = {
  periodLabel: '2026년 9월', totalBudget: 700000, totalUsed: 10000,
  buckets: [{ key: 'resident' as const, label: '정주비', budget: 500000, used: 10000, items: [{ category: 'food', label: '식비', budget: 200000, used: 10000 }] }, { key: 'studySpace' as const, label: '학습공간비', budget: 200000, used: 0, items: [] }],
};

function StatefulEvidenceExport({ initialEvidence = [], entries = [] }: { initialEvidence?: ComponentProps<typeof EvidenceExport>['reportEvidence']; entries?: ComponentProps<typeof EvidenceExport>['entries'] }) {
  const [reportEvidence, setReportEvidence] = useState<ComponentProps<typeof EvidenceExport>['reportEvidence']>(initialEvidence);
  return <EvidenceExport reportEvidence={reportEvidence} onReportEvidenceChange={setReportEvidence} summary={summary} periodKey="2026-09" entries={entries} />;
}

describe('EvidenceExport', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const canvasContext = { fillStyle: '', font: '', strokeStyle: '', fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    exportMocks.saveFile.mockReset(); exportMocks.create.mockReset(); exportMocks.load.mockReset();
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(async () => new Uint8Array([1, 2, 3])) });
    exportMocks.load.mockResolvedValue({ getPageCount: () => 1, getPageIndices: () => [], copyPages: vi.fn(async () => []) });
    exportMocks.saveFile.mockResolvedValue({ fileName: 'shinhanhae_report_evidence.pdf', relativePath: 'Downloads' });
    canvasContext.fillRect = vi.fn(); canvasContext.fillText = vi.fn(); canvasContext.strokeRect = vi.fn(); canvasContext.drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })));
    URL.createObjectURL = vi.fn(() => 'blob:submission-preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('shows stored receipts before batch OCR completes and only fills dates without auto-linking', async () => {
    let finishFirst!: (value: unknown) => void;
    const bitmap = { width: 600, height: 1200, close: vi.fn() };
    vi.stubGlobal('createImageBitmap', vi.fn().mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValue(bitmap));
    vi.mocked(ReceiptOcr.recognize).mockResolvedValue({ text: '결제일시 2026-09-20 12:00:00' });
    const entries = [{ id: 'pay', amount: 5000, merchant: '후보 결제', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', status: 'classified' as const, bucket: 'resident' as const, category: 'food' }];
    const { container } = render(<StatefulEvidenceExport entries={entries} />);
    fireEvent.change(container.querySelectorAll('input[type="file"]')[2], { target: { files: [new File(['a'], 'first.jpg', { type: 'image/jpeg' }), new File(['b'], 'second.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByText('first.jpg')).toBeInTheDocument();
    expect(await screen.findByText('second.jpg')).toBeInTheDocument();
    expect(screen.getByText('파일 추가 · 날짜 확인 중 0 / 2장')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF 생성' })).toBeDisabled();
    await waitFor(() => expect(finishFirst).toBeDefined()); finishFirst(bitmap);
    await waitFor(() => expect(screen.getByLabelText('영수증 1 날짜')).toHaveValue('2026-09-20'));
    await waitFor(() => expect(screen.getByLabelText('영수증 2 날짜')).toHaveValue('2026-09-20'));
    expect(screen.queryByText('결제 연결 완료')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /후보 결제/ })).toHaveLength(2);
  });

  it('lists missing originals and blocks incomplete generation until reattached', async () => {
    vi.mocked(loadEvidence).mockRejectedValueOnce(new Error('missing'));
    const { container } = render(<StatefulEvidenceExport initialEvidence={[{ id: 'missing', stored: { id: 'lost', fileName: 'lost.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    expect(await screen.findByText('원본 파일 1개를 찾지 못했습니다')).toBeInTheDocument();
    expect(screen.getByText('lost.jpg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'PDF 생성' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('lost.jpg 원본 다시 추가'), { target: { files: [new File(['restored'], 'restored.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByText('restored.jpg')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('원본 파일 1개를 찾지 못했습니다')).not.toBeInTheDocument());
    expect(container.querySelectorAll('input[type="file"]')).toHaveLength(3);
  });

  it('filters receipt tasks, keeps source order controls correct and collapses completed cards', async () => {
    const stored = (name: string) => ({ id: name, fileName: name + '.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' });
    const entries = [{ id: 'linked-pay', amount: 5000, merchant: '연결 결제', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', status: 'classified' as const, bucket: 'resident' as const, category: 'food' }];
    const { container } = render(<StatefulEvidenceExport entries={entries} initialEvidence={[
      { id: 'done', stored: stored('done'), section: 'receipt', order: 0, receiptDate: '2026-09-20', linkedEntryId: 'linked-pay' },
      { id: 'todo', stored: stored('todo'), section: 'receipt', order: 1, receiptDate: '2026-09-20' },
      { id: 'date', stored: stored('date'), section: 'receipt', order: 2 },
    ]} />);
    await screen.findByText('done.jpg');
    expect(container.querySelector('#evidence-done details')).not.toHaveAttribute('open');
    fireEvent.change(screen.getByLabelText('영수증 보기 필터'), { target: { value: 'unlinked' } });
    expect(screen.queryByText('done.jpg')).not.toBeInTheDocument(); expect(screen.getByText('todo.jpg')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('영수증 보기 필터'), { target: { value: 'date' } });
    expect(screen.queryByText('todo.jpg')).not.toBeInTheDocument(); expect(screen.getByText('date.jpg')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음 미연결 영수증' }));
    expect(screen.getByLabelText('영수증 보기 필터')).toHaveValue('unlinked');
  });

  it('does not unlink on an unchanged date blur and uses the current payment category in the PDF', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 1200, close: vi.fn() })));
    const entries = [{ id: 'p', cardLast4: '1234', merchant: '연결 결제', amount: 5000, status: 'classified' as const, bucket: 'resident' as const, category: 'food', occurredAt: '2026-09-20T12:00:00+09:00' }];
    const { container } = render(<StatefulEvidenceExport entries={entries} initialEvidence={[{ id: 'linked', stored: { id: 's', fileName: 'linked.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0, receiptDate: '2026-09-20', linkedEntryId: 'p', category: 'transport' }]} />);
    await screen.findByText('linked.jpg');
    fireEvent.click(screen.getByText('연결한 영수증 확인 · 수정'));
    fireEvent.blur(screen.getByLabelText('영수증 1 날짜'));
    expect(await screen.findByText('결제 연결 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalled());
    expect(canvasContext.fillText).toHaveBeenCalledWith('식비', expect.any(Number), expect.any(Number));
    expect(container.querySelector('#evidence-linked')).toBeInTheDocument();
  });

  it('renders only the adjusted final plan in the PDF, without adjustment history or negative allocations', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 1200, close: vi.fn() })));
    const policy = adjustBudget({ ...emptyPolicy, plans: { ...emptyPolicy.plans, food: 200000, education: 200000, transport: 100000, cafe: 200000 } }, { from: 'transport', to: 'housing', amount: 50000 }, {});
    const adjustedSummary = { ...summary, totalUsed: 0, buckets: (['resident', 'studySpace'] as const).map((key) => ({ key, label: key === 'resident' ? '정주비' : '학습공간비', budget: getPolicyLimit(policy, key), used: 0, items: getPolicyItems(policy).filter((item) => item.bucket === key).map((item) => ({ category: item.ledgerCategories[0], label: item.label, budget: getCategoryLimit(policy, item.ledgerCategories[0]), used: 0 })) })) };
    render(<EvidenceExport reportEvidence={[{ id: 'receipt', stored: { id: 'stored', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={adjustedSummary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalled());
    const texts = vi.mocked(canvasContext.fillText).mock.calls.map(([text]) => text);
    expect(texts.filter((text) => text === '계획 50,000원')).toHaveLength(2);
    expect(texts).not.toContain('계획 100,000원');
    expect(texts).not.toContain('계획 -50,000원');
    expect(texts.some((text) => /최초 계획|예산 조정|변경 이력/.test(text))).toBe(false);
  });

  it('invalidates a statement raster cache after redaction or re-reading its rows', () => {
    const base = { id: 'statement-1', section: 'statement' as const, statementRows: [{ id: 'row-1', date: '2026-09-20', time: '12:00:00', summary: '체크카드', withdrawal: 12000, deposit: 0, merchant: '개인 결제처' }] };
    const original = evidenceRasterCacheKey(base, 'default');
    expect(evidenceRasterCacheKey({ ...base, excludedStatementRowIds: ['row-1'] }, 'default')).not.toBe(original);
    expect(evidenceRasterCacheKey({ ...base, statementRows: [{ ...base.statementRows[0], merchant: '다른 결제처' }] }, 'default')).not.toBe(original);
  });

  it('shows receipt coverage before a submission is generated', () => {
    render(<EvidenceExport reportEvidence={[]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[{ id: 'payment-1', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '카페', amount: 10000, status: 'classified', bucket: 'resident', category: 'food' }]} />);
    expect(screen.getByText('영수증 연결 확인')).toBeInTheDocument();
    expect(screen.getByText(/결제 1건 · 연결 0건 · 미연결 1건/)).toBeInTheDocument();
    expect(screen.getByText(/연결하지 않아도 PDF를 생성할 수 있습니다/)).toBeInTheDocument();
  });

  it('does not repeat old amount-matching instructions from saved receipts', async () => {
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'legacy-receipt', section: 'receipt', order: 0, stored: { id: 'old', fileName: 'old.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-20T00:00:00+09:00' }, receiptOcrStatus: 'ambiguous', receiptOcrMessage: '날짜와 금액을 읽었습니다. 추천 또는 직접 연결해 주세요.' }]} />);
    await screen.findByText('old.jpg');
    expect(screen.queryByText(/날짜와 금액을 읽었습니다/)).not.toBeInTheDocument();
    expect(screen.getByText('결제 날짜를 선택하면 해당 날짜의 결제를 보여드립니다.')).toBeInTheDocument();
  });

  it('opens an anchored PDF guide from the header request and advances only with buttons', () => {
    render(<EvidenceExport helpRequest={1} reportEvidence={[]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    const dialog = screen.getByRole('dialog', { name: 'PDF 생성 도움말' });
    expect(screen.getByText('입출금내역을 추가하세요')).toBeInTheDocument();
    fireEvent.pointerDown(dialog, { clientX: 280 });
    fireEvent.pointerUp(dialog, { clientX: 120 });
    expect(screen.getByText('입출금내역을 추가하세요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('가릴 내역을 확인하세요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(screen.queryByRole('dialog', { name: 'PDF 생성 도움말' })).not.toBeInTheDocument();
  });

  it('rejects an oversized evidence file before storing or parsing it', async () => {
    const oversized = new File(['receipt'], 'oversized.jpg', { type: 'image/jpeg' });
    Object.defineProperty(oversized, 'size', { value: 20 * 1024 * 1024 + 1 });
    const { container } = render(<StatefulEvidenceExport />);
    const receiptInput = container.querySelectorAll('input[type="file"]')[2] as HTMLInputElement;
    fireEvent.change(receiptInput, { target: { files: [oversized] } });
    expect(await screen.findByText(/파일 크기를 확인해 주세요/)).toBeInTheDocument();
    expect(screen.queryByText('oversized.jpg')).not.toBeInTheDocument();
  });

  it('warns but exports an unlinked receipt, including its own divider and page', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 2400, close: vi.fn() })));
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[{ id: 'payment-1', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '카페', amount: 10000, status: 'classified', bucket: 'resident', category: 'food' }]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalledWith('shinhanhae_report_evidence.pdf', expect.any(Uint8Array), 'application/pdf'));
    expect(screen.getAllByText(/영수증 미연결 결제 1건 · 결제 미연결 영수증 1장/).length).toBeGreaterThan(0);
    expect(canvasContext.fillText).toHaveBeenCalledWith('미연결 영수증', expect.any(Number), expect.any(Number));
    const pdf = await exportMocks.create.mock.results[0].value;
    expect(pdf.addPage).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Downloads에 저장했습니다/)).toBeInTheDocument();
  });

  it('keeps the screen on while a PDF is being made and lets it turn off afterwards', async () => {
    const lock = { release: vi.fn(async () => undefined) };
    const request = vi.fn(async () => lock);
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 2400, close: vi.fn() })));
    let release: () => void = () => undefined;
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(() => new Promise<Uint8Array>((resolve) => { release = () => resolve(new Uint8Array([1, 2, 3])); })) });
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await waitFor(() => expect(exportMocks.create).toHaveBeenCalled());
    expect(lock.release).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '생성 취소' }));
    release();
    await waitFor(() => expect(lock.release).toHaveBeenCalled());
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('cancels an export in progress without saving and keeps the selected files', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 2400, close: vi.fn() })));
    let release: () => void = () => undefined;
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(() => new Promise<Uint8Array>((resolve) => { release = () => resolve(new Uint8Array([1, 2, 3])); })) });
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 취소' }));
    await waitFor(() => expect(exportMocks.create).toHaveBeenCalled());
    release();
    expect(await screen.findByText('PDF 생성을 취소했습니다. 선택한 파일은 그대로 유지됩니다.')).toBeInTheDocument();
    expect(exportMocks.saveFile).not.toHaveBeenCalled();
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument();
  });

  it('uses OCR date only to show same-day payments and requires one user click to link', async () => {
    const entries = [
      { id: 'same-day', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '같은 날 결제', amount: 10000, status: 'classified' as const, bucket: 'resident' as const, category: 'food' },
      { id: 'other-day', cardLast4: '1234', occurredAt: '2026-09-21T10:00:00+09:00', merchant: '다른 날 결제', amount: 10000, status: 'classified' as const, bucket: 'resident' as const, category: 'food' },
    ];
    render(<StatefulEvidenceExport entries={entries} initialEvidence={[{ id: 'receipt-date-only', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-20T00:00:00+09:00' }, section: 'receipt', order: 0, receiptDate: '2026-09-20', receiptOcrStatus: 'ambiguous' }]} />);

    expect(await screen.findByText(/2026-09-20 결제 1건/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /같은 날 결제/ })).toBeInTheDocument();
    expect(screen.queryByText('다른 날 결제')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /같은 날 결제/ }));
    expect(await screen.findByText('결제 연결 완료')).toBeInTheDocument();
  });

  it('identifies a manually selected date without claiming OCR read it', async () => {
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'manual', stored: { id: 's', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    const date = await screen.findByLabelText('영수증 1 날짜');
    fireEvent.change(date, { target: { value: '2026-09-20' } }); fireEvent.blur(date);
    expect(await screen.findByText('선택한 날짜의 결제 중 하나를 눌러 연결해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText(/결제 날짜를 읽었습니다/)).not.toBeInTheDocument();
  });

  it('shows same-day payments as soon as a receipt date is picked, without leaving the field', async () => {
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'picked', stored: { id: 's', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    fireEvent.change(await screen.findByLabelText('영수증 1 날짜'), { target: { value: '2026-09-20' } });
    expect(await screen.findByText('선택한 날짜의 결제 중 하나를 눌러 연결해 주세요.')).toBeInTheDocument();
  });

  it('opens the calendar when any part of the date field is tapped', async () => {
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'tap', stored: { id: 's', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    const date = await screen.findByLabelText('영수증 1 날짜') as HTMLInputElement;
    const showPicker = vi.fn();
    Object.defineProperty(date, 'showPicker', { value: showPicker });
    fireEvent.click(date);
    expect(showPicker).toHaveBeenCalledOnce();
  });

  it.runIf(import.meta.env.MODE === 'internal')('cancels the internal benchmark before saving a result and keeps receipt files', async () => {
    vi.stubEnv('MODE', 'internal');
    let resolveBitmap!: (value: unknown) => void;
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise((resolve) => { resolveBitmap = resolve; })));
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'cancel', stored: { id: 's', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: '과거 방식 시간 측정' }));
    expect(await screen.findByText('0 / 1장 처리 완료 · 0%')).toBeInTheDocument();
    await waitFor(() => expect(resolveBitmap).toBeDefined());
    fireEvent.click(screen.getByRole('button', { name: '생성 취소' }));
    resolveBitmap({ width: 600, height: 1200, close: vi.fn() });
    expect(await screen.findByText('시간 측정을 취소했습니다. 선택한 파일은 그대로 유지됩니다.')).toBeInTheDocument();
    expect(screen.getByText('receipt.jpg')).toBeInTheDocument(); expect(exportMocks.saveFile).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('opens a receipt image in a larger preview from its thumbnail', async () => {
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'receipt-preview', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-20T00:00:00+09:00' }, section: 'receipt', order: 0 }]} />);
    const thumbnail = await screen.findByRole('button', { name: '영수증 1 크게 보기' });
    fireEvent.click(thumbnail);
    expect(screen.getByRole('dialog', { name: '영수증 크게 보기' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '영수증 미리보기 닫기' }));
    expect(screen.queryByRole('dialog', { name: '영수증 크게 보기' })).not.toBeInTheDocument();
  });

  it('turns a parsed bank statement into a selectable redaction table', async () => {
    const { container } = render(<StatefulEvidenceExport />);
    const statementInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(statementInput, { target: { files: [new File(['pdf'], 'statement.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByText(/입출금 1행 · 제외 0행/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/입출금 1행/));
    expect(screen.getByText(/체크카드/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText(/입출금 1행 · 제외 1행/)).toBeInTheDocument());
  });

  it('blocks export when a bank PDF could not be converted into a maskable table', async () => {
    render(<EvidenceExport reportEvidence={[{ id: 'statement-1', stored: { id: 'stored-1', fileName: 'statement.pdf', mimeType: 'application/pdf', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'statement', statementParseFailed: true, order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('statement.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    expect(await screen.findByText(/원본 개인정보 보호를 위해 비밀번호 입력 후 다시 읽어/)).toBeInTheDocument();
  });

  it('allows a password retry after a protected bank statement could not be read', async () => {
    vi.mocked(parseShinhanBankPdfExport).mockRejectedValueOnce(new Error('password required'));
    const { container } = render(<StatefulEvidenceExport />);
    const statementInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(statementInput, { target: { files: [new File(['protected'], 'protected.pdf', { type: 'application/pdf' })] } });

    expect(await screen.findByText('표를 읽지 못했습니다')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('protected.pdf PDF 비밀번호'), { target: { value: '950504' } });
    fireEvent.click(screen.getByRole('button', { name: '표 다시 읽기' }));

    await waitFor(() => expect(screen.getByText(/입출금 1행 · 제외 0행/)).toBeInTheDocument());
    expect(parseShinhanBankPdfExport).toHaveBeenLastCalledWith(expect.any(ArrayBuffer), '950504');
  });

  it('connects additional proof only to eligible housing or transport payments', async () => {
    const entries = [
      { id: 'housing-1', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '주거 결제', amount: 50000, status: 'classified' as const, bucket: 'resident' as const, category: 'lodging' },
      { id: 'food-1', cardLast4: '1234', occurredAt: '2026-09-20T11:00:00+09:00', merchant: '식비 결제', amount: 10000, status: 'classified' as const, bucket: 'resident' as const, category: 'food' },
      { id: 'transport-1', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '교통 결제', amount: 8000, status: 'classified' as const, bucket: 'resident' as const, category: 'transport' },
    ];
    render(<StatefulEvidenceExport entries={entries} initialEvidence={[{ id: 'proof-1', stored: { id: 'stored-proof-1', fileName: 'transfer.pdf', mimeType: 'application/pdf', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'transactionProof', order: 0 }]} />);

    await screen.findByText('transfer.pdf');
    const select = screen.getByLabelText('거래증빙 1 결제 연결');
    expect(select).toHaveTextContent('주거 결제');
    expect(select).toHaveTextContent('교통 결제');
    expect(select).not.toHaveTextContent('식비 결제');
    fireEvent.change(select, { target: { value: 'transport-1' } });
    await waitFor(() => expect(screen.getByLabelText('거래증빙 1 결제 연결')).toHaveValue('transport-1'));
  });

  it('generates a masked statement submission instead of copying the original bank PDF', async () => {
    render(<EvidenceExport reportEvidence={[{ id: 'statement-1', stored: { id: 'stored-1', fileName: 'statement.pdf', mimeType: 'application/pdf', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'statement', order: 0, excludedStatementRowIds: ['row-private'], statementRows: [
      { id: 'row-keep', date: '2026-09-20', time: '10:00:00', summary: '체크카드', withdrawal: 12000, deposit: 0, merchant: '사업 결제처', balance: 688000 },
      { id: 'row-private', date: '2026-09-20', time: '12:00:00', summary: '개인 이체', withdrawal: 3000, deposit: 0, merchant: '개인 결제처', balance: 685000 },
    ] }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);

    await screen.findByText('statement.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));

    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalledWith('shinhanhae_report_evidence.pdf', expect.any(Uint8Array), 'application/pdf'));
    expect(canvasContext.fillText).toHaveBeenCalledWith('████████', expect.any(Number), expect.any(Number));
    expect(screen.getByText(/Downloads에 저장했습니다/)).toBeInTheDocument();
  });
});
