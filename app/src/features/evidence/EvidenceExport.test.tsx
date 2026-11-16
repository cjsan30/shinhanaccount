import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEvidence, removeStoredEvidence } from '../../native/evidenceVault';
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
const exportMocks = vi.hoisted(() => ({ saveFile: vi.fn(), create: vi.fn(), load: vi.fn(), openSavedFile: vi.fn() }));
vi.mock('../../native/fileExport', () => ({ saveFile: exportMocks.saveFile, openSavedFile: exportMocks.openSavedFile, isSavedFileNotFound: (error: unknown) => (error as { code?: string } | null)?.code === 'FILE_NOT_FOUND', bytesToBase64: () => 'local-test-image' }));
vi.mock('../../native/receiptOcr', () => ({ ReceiptOcr: { recognize: vi.fn(async () => ({ text: '결제일시 2026-09-20 12:00:00' })) } }));
vi.mock('pdf-lib', () => ({ PDFDocument: { create: exportMocks.create, load: exportMocks.load } }));
vi.mock('./pipeline/preview', () => ({ renderPreviewPages: vi.fn(async (_bytes: Uint8Array, onPage: (done: number, total: number) => void) => { onPage(1, 2); onPage(2, 2); return [new Blob(['page-1'], { type: 'image/jpeg' }), new Blob(['page-2'], { type: 'image/jpeg' })]; }) }));
vi.mock('../../domain/shinhanBankImport', async (importOriginal) => ({
  getMaskedAccountLast4: (await importOriginal<typeof import('../../domain/shinhanBankImport')>()).getMaskedAccountLast4,
  parseShinhanBankPdfExport: vi.fn(async () => [{ source: 'bankCsv', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '개인 결제처', summary: '체크카드', amount: 12000, balance: 683000, transactionId: 'row-1', direction: 'withdrawal' }]),
}));

const summary = {
  periodLabel: '2026년 9월', totalBudget: 700000, totalUsed: 10000,
  buckets: [{ key: 'resident' as const, label: '정주비', budget: 500000, used: 10000, items: [{ category: 'food', label: '식비', budget: 200000, used: 10000 }] }, { key: 'studySpace' as const, label: '학습공간비', budget: 200000, used: 0, items: [] }],
};

function StatefulEvidenceExport({ initialEvidence = [], entries = [], onNotify }: { initialEvidence?: ComponentProps<typeof EvidenceExport>['reportEvidence']; entries?: ComponentProps<typeof EvidenceExport>['entries']; onNotify?: (message: string) => void }) {
  const [reportEvidence, setReportEvidence] = useState<ComponentProps<typeof EvidenceExport>['reportEvidence']>(initialEvidence);
  return <EvidenceExport reportEvidence={reportEvidence} onReportEvidenceChange={setReportEvidence} summary={summary} periodKey="2026-09" entries={entries} onNotify={onNotify} />;
}

/** The bottom button now builds an in-app preview; saving happens only from the preview. */
async function previewAndSave() {
  fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
  fireEvent.click(await screen.findByRole('button', { name: '이대로 PDF 생성' }));
}

describe('EvidenceExport', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const canvasContext = { fillStyle: '', font: '', strokeStyle: '', fillRect: vi.fn(), fillText: vi.fn(), strokeRect: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;

  beforeEach(() => {
    exportMocks.saveFile.mockReset(); exportMocks.create.mockReset(); exportMocks.load.mockReset(); exportMocks.openSavedFile.mockReset().mockResolvedValue(undefined);
    window.localStorage.removeItem('shinhanhae-recent-reports-v1');
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(async () => new Uint8Array([1, 2, 3])) });
    exportMocks.load.mockResolvedValue({ getPageCount: () => 1, getPageIndices: () => [], copyPages: vi.fn(async () => []) });
    exportMocks.saveFile.mockResolvedValue({ fileName: 'shinhanhae_report_evidence.pdf', relativePath: 'Downloads' });
    canvasContext.fillRect = vi.fn(); canvasContext.fillText = vi.fn(); canvasContext.strokeRect = vi.fn(); canvasContext.drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,AQID');
    URL.createObjectURL = vi.fn(() => 'blob:submission-preview');
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('clears every attachment of all three sections only after the user confirms', async () => {
    const stored = (id: string) => ({ id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' });
    const evidence = [
      { id: 'statement', stored: stored('statement'), section: 'statement' as const, order: 0 },
      { id: 'proof', stored: stored('proof'), section: 'transactionProof' as const, order: 0 },
      { id: 'receipt', stored: stored('receipt'), section: 'receipt' as const, order: 0 },
    ];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })));
    vi.mocked(removeStoredEvidence).mockReset().mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const notify = vi.fn();
    render(<StatefulEvidenceExport initialEvidence={evidence} onNotify={notify} />);
    const clear = screen.getByRole('button', { name: '보고서 초기화' });
    expect(clear.parentElement?.firstElementChild).toBe(clear);
    fireEvent.click(clear);
    expect(confirm).toHaveBeenLastCalledWith('사용보고서를 초기화할까요?\n첨부한 입출금내역·거래증빙·영수증 3개를 모두 지웁니다.\n되돌릴 수 없습니다.');
    expect(removeStoredEvidence).not.toHaveBeenCalled();
    fireEvent.click(clear);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('사용보고서를 초기화했습니다.'));
    expect(screen.queryByText('사용보고서를 초기화했습니다.')).not.toBeInTheDocument();
    expect(vi.mocked(removeStoredEvidence).mock.calls.map(([file]) => file.id)).toEqual(['statement', 'proof', 'receipt']);
    expect(screen.queryByRole('button', { name: '보고서 초기화' })).not.toBeInTheDocument();
  });

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
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
    await waitFor(() => expect(finishFirst).toBeDefined()); finishFirst(bitmap);
    await waitFor(() => expect(screen.getByLabelText('영수증 1 날짜')).toHaveValue('2026-09-20'));
    await waitFor(() => expect(screen.getByLabelText('영수증 2 날짜')).toHaveValue('2026-09-20'));
    expect(screen.queryByText('결제 연결 완료')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /후보 결제/ })).toHaveLength(2);
  });

  it('drops attachments whose stored copy is gone and marks the payment whose receipt link was lost', async () => {
    window.localStorage.clear();
    const entries = [{ id: 'pay', amount: 5000, merchant: '연결 결제', cardLast4: '1234', occurredAt: '2026-09-20T12:00:00+09:00', status: 'classified' as const, bucket: 'resident' as const, category: 'food' }];
    vi.mocked(loadEvidence).mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'EVIDENCE_NOT_FOUND' }));
    const { unmount } = render(<StatefulEvidenceExport entries={entries} initialEvidence={[{ id: 'missing', stored: { id: 'lost', fileName: 'lost.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0, receiptDate: '2026-09-20', linkedEntryId: 'pay' }]} />);
    expect(await screen.findByText('원본을 찾지 못해 연결이 풀린 결제 1건')).toBeInTheDocument();
    expect(screen.queryByText('lost.jpg')).not.toBeInTheDocument();
    expect(screen.queryByText(/찾지 못했습니다/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '보고서 초기화' })).not.toBeInTheDocument();
    unmount();
    render(<StatefulEvidenceExport entries={entries} />);
    expect(await screen.findByText('원본을 찾지 못해 연결이 풀린 결제 1건')).toBeInTheDocument();
    window.localStorage.clear();
  });

  it('keeps an attachment that could not be read for another reason and blocks generation', async () => {
    window.localStorage.clear();
    vi.mocked(loadEvidence).mockRejectedValueOnce(new Error('read failed'));
    render(<StatefulEvidenceExport initialEvidence={[{ id: 'busy', stored: { id: 'busy', fileName: 'busy.jpg', mimeType: 'image/jpeg', size: 1, attachedAt: '2026-09-20' }, section: 'receipt', order: 0 }]} />);
    expect(await screen.findByText('첨부 1개를 읽지 못했습니다. 사용보고서를 닫았다가 다시 열어 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '보고서 초기화' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '미리보기' })).toBeDisabled();
    expect(screen.queryByText(/연결이 풀린 결제/)).not.toBeInTheDocument();
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
    await previewAndSave();
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
    await previewAndSave();
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
    const dialog = screen.getByRole('dialog', { name: '사용보고서 작성 도움말' });
    expect(screen.getByText('입출금내역을 추가하세요')).toBeInTheDocument();
    fireEvent.pointerDown(dialog, { clientX: 280 });
    fireEvent.pointerUp(dialog, { clientX: 120 });
    expect(screen.getByText('입출금내역을 추가하세요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('모자이크할 내역을 확인하세요')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(screen.queryByRole('dialog', { name: '사용보고서 작성 도움말' })).not.toBeInTheDocument();
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
    await previewAndSave();
    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalledWith('shinhanhae_report_evidence.pdf', expect.any(Uint8Array), 'application/pdf'));
    expect(screen.getAllByText(/영수증 미연결 결제 1건 · 결제 미연결 영수증 1장/).length).toBeGreaterThan(0);
    expect(canvasContext.fillText).toHaveBeenCalledWith('미연결 영수증', expect.any(Number), expect.any(Number));
    const pdf = await exportMocks.create.mock.results[0].value;
    expect(pdf.addPage).toHaveBeenCalledTimes(3);
    expect(await screen.findByText(/Downloads에 저장했습니다/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'));
    await waitFor(() => expect(exportMocks.create).toHaveBeenCalled());
    expect(lock.release).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '생성 취소' }));
    release();
    await waitFor(() => expect(lock.release).toHaveBeenCalled());
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('shows the assembled PDF in the app and saves those same bytes only after [이대로 PDF 생성]', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 1200, close: vi.fn() })));
    const built = new Uint8Array([7, 7, 7]);
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(async () => built) });
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    const dialog = await screen.findByRole('dialog', { name: 'PDF 미리보기' });
    expect(dialog).toHaveTextContent('2쪽 · 0.0MB');
    expect(screen.getAllByRole('img', { name: /쪽$/ })).toHaveLength(2);
    expect(exportMocks.saveFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    expect(screen.queryByRole('dialog', { name: 'PDF 미리보기' })).not.toBeInTheDocument();
    expect(exportMocks.saveFile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('dialog', { name: 'PDF 미리보기' });
    act(() => { window.dispatchEvent(new Event('close-pdf-preview')); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'PDF 미리보기' })).not.toBeInTheDocument());
    await previewAndSave();
    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalledTimes(1));
    expect(exportMocks.saveFile).toHaveBeenCalledWith('shinhanhae_report_evidence.pdf', built, 'application/pdf');
    // The preview closes once the save has finished, not when it starts.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'PDF 미리보기' })).not.toBeInTheDocument());
    const preview = screen.getByRole('button', { name: '미리보기' });
    const notice = screen.getByText(/Downloads에 저장했습니다/);
    const list = screen.getByRole('region', { name: '만든 보고서' });
    // The result appears below the button that produced it.
    expect(preview.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(list).toHaveTextContent('0.0MB');
  });

  it('lists saved reports again after the sheet is reopened and drops one whose file was deleted', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 1200, close: vi.fn() })));
    exportMocks.saveFile.mockResolvedValueOnce({ fileName: 'shinhanhae_report_evidence_20261116_124000.pdf', relativePath: 'Downloads/신청해 계산기', uri: 'content://media/external/downloads/41' });
    const props = { reportEvidence: [{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt' as const, order: 0 }], onReportEvidenceChange: vi.fn(), summary, periodKey: '2026-09', entries: [] };
    const first = render(<EvidenceExport {...props} />);
    await screen.findByText('receipt.jpg');
    await previewAndSave();
    await screen.findByRole('region', { name: '만든 보고서' });
    first.unmount();
    render(<EvidenceExport {...props} />);
    const open = await screen.findByRole('button', { name: /보고서 열기$/ });
    fireEvent.click(open);
    await waitFor(() => expect(exportMocks.openSavedFile).toHaveBeenCalledWith('content://media/external/downloads/41', 'application/pdf'));
    exportMocks.openSavedFile.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'FILE_NOT_FOUND' }));
    fireEvent.click(open);
    expect(await screen.findByText('파일을 찾지 못해 목록에서 뺐습니다. 파일 앱에서 지웠을 수 있습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /보고서 열기$/ })).not.toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem('shinhanhae-recent-reports-v1')).toBeNull());
  });

  it('keeps the preview open with a notice when saving fails', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 1200, close: vi.fn() })));
    exportMocks.saveFile.mockRejectedValueOnce(new Error('disk'));
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    await previewAndSave();
    expect(await screen.findByText('PDF를 저장하지 못했습니다. 다시 시도해 주세요.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'PDF 미리보기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이대로 PDF 생성' })).toBeEnabled();
  });

  it('cancels an export in progress without saving and keeps the selected files', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 600, height: 2400, close: vi.fn() })));
    let release: () => void = () => undefined;
    exportMocks.create.mockResolvedValue({ embedJpg: vi.fn(async () => ({})), addPage: vi.fn(() => ({ drawImage: vi.fn() })), save: vi.fn(() => new Promise<Uint8Array>((resolve) => { release = () => resolve(new Uint8Array([1, 2, 3])); })) });
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    fireEvent.click(await screen.findByRole('button', { name: '생성 취소' }));
    await waitFor(() => expect(exportMocks.create).toHaveBeenCalled());
    release();
    expect(await screen.findByText('미리보기 준비를 취소했습니다. 선택한 파일은 그대로 유지됩니다.')).toBeInTheDocument();
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

  const attachStatement = async (container: HTMLElement, name = 'statement.pdf') => {
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [new File(['pdf'], name, { type: 'application/pdf' })] } });
    expect(await screen.findByText('계좌 확인이 필요합니다')).toBeInTheDocument();
  };
  const maskedAccountRow = { source: 'bankCsv' as const, occurredAt: '2026-09-20T12:00:00+09:00', accountMasked: '[신한] 110-***-*51234', merchant: '개인 결제처', summary: '체크카드', amount: 12000, balance: 683000, transactionId: 'row-1', direction: 'withdrawal' as const };

  it('does not read a statement attached here until its account last 4 digits are entered', async () => {
    const { container } = render(<StatefulEvidenceExport />);
    await attachStatement(container);
    expect(parseShinhanBankPdfExport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
    expect(await screen.findByText('입출금내역의 계좌 끝 4자리를 입력해 주세요.')).toBeInTheDocument();
    expect(parseShinhanBankPdfExport).not.toHaveBeenCalled();
  });

  it('refuses a statement whose account differs from the entered last 4 digits', async () => {
    vi.mocked(parseShinhanBankPdfExport).mockResolvedValueOnce([maskedAccountRow]);
    const { container } = render(<StatefulEvidenceExport />);
    await attachStatement(container);
    fireEvent.change(screen.getByLabelText('statement.pdf 계좌 끝 4자리'), { target: { value: '9999' } });
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
    expect(await screen.findByText('입력한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다.')).toBeInTheDocument();
    expect(screen.queryByText(/입출금 1행/)).not.toBeInTheDocument();
  });

  it('reads a statement at once when the bank-masked account matches', async () => {
    vi.mocked(parseShinhanBankPdfExport).mockResolvedValueOnce([maskedAccountRow]);
    const { container } = render(<StatefulEvidenceExport />);
    await attachStatement(container);
    fireEvent.change(screen.getByLabelText('statement.pdf 계좌 끝 4자리'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
    expect(await screen.findByText(/입출금 1행 · 모자이크 0행/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '그래도 첨부' })).not.toBeInTheDocument();
  });

  it('turns a parsed bank statement into a selectable redaction table', async () => {
    const { container } = render(<StatefulEvidenceExport />);
    await attachStatement(container);
    fireEvent.change(screen.getByLabelText('statement.pdf 계좌 끝 4자리'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
    // The mocked file shows no account, so it is attached only after confirmation.
    fireEvent.click(await screen.findByRole('button', { name: '그래도 첨부' }));
    expect(await screen.findByText(/입출금 1행 · 모자이크 0행/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/입출금 1행/));
    expect(screen.getByText(/체크카드/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText(/입출금 1행 · 모자이크 1행/)).toBeInTheDocument());
  });

  it('blocks export when a bank PDF could not be converted into a maskable table', async () => {
    render(<EvidenceExport reportEvidence={[{ id: 'statement-1', stored: { id: 'stored-1', fileName: 'statement.pdf', mimeType: 'application/pdf', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'statement', statementParseFailed: true, order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[]} />);
    await screen.findByText('statement.pdf');
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    expect(await screen.findByText(/원본 개인정보 보호를 위해 계좌 끝 4자리\(비밀번호가 있으면 함께\)를 입력하고 표를 읽어/)).toBeInTheDocument();
  });

  it('allows a password retry after a protected bank statement could not be read', async () => {
    vi.mocked(parseShinhanBankPdfExport).mockRejectedValueOnce(new Error('password required')).mockResolvedValueOnce([maskedAccountRow]);
    const { container } = render(<StatefulEvidenceExport />);
    await attachStatement(container, 'protected.pdf');
    fireEvent.change(screen.getByLabelText('protected.pdf 계좌 끝 4자리'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));
    expect(await screen.findByText('입출금내역 표를 읽지 못했습니다. PDF 비밀번호와 파일 형식을 확인해 주세요.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('protected.pdf PDF 비밀번호'), { target: { value: 'test-pass' } });
    fireEvent.click(screen.getByRole('button', { name: '표 읽기' }));

    await waitFor(() => expect(screen.getByText(/입출금 1행 · 모자이크 0행/)).toBeInTheDocument());
    expect(parseShinhanBankPdfExport).toHaveBeenLastCalledWith(expect.any(ArrayBuffer), 'test-pass');
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
    await previewAndSave();

    await waitFor(() => expect(exportMocks.saveFile).toHaveBeenCalledWith('shinhanhae_report_evidence.pdf', expect.any(Uint8Array), 'application/pdf'));
    expect(canvasContext.fillText).toHaveBeenCalledWith('████████', expect.any(Number), expect.any(Number));
    expect(await screen.findByText(/Downloads에 저장했습니다/)).toBeInTheDocument();
  });
});
