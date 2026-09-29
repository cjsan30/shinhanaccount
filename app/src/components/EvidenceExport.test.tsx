import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EvidenceExport } from './EvidenceExport';
import { evidenceRasterCacheKey } from '../features/evidence/rasterCacheKey';
import { parseShinhanBankPdfExport } from '../domain/shinhanBankImport';

vi.mock('../native/evidenceVault', () => ({
  loadEvidence: vi.fn(async (stored: { fileName: string; mimeType: string }) => new File(['receipt'], stored.fileName, { type: stored.mimeType })),
  removeStoredEvidence: vi.fn(),
  storeEvidence: vi.fn(async (file: File) => ({ id: 'stored-upload', fileName: file.name, mimeType: file.type, size: file.size, attachedAt: '2026-09-29T00:00:00+09:00' })),
}));
const exportMocks = vi.hoisted(() => ({ saveFile: vi.fn(), create: vi.fn(), load: vi.fn() }));
vi.mock('../native/fileExport', () => ({ saveFile: exportMocks.saveFile }));
vi.mock('pdf-lib', () => ({ PDFDocument: { create: exportMocks.create, load: exportMocks.load } }));
vi.mock('../domain/shinhanBankImport', () => ({
  parseShinhanBankPdfExport: vi.fn(async () => [{ source: 'bankCsv', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '개인 결제처', summary: '체크카드', amount: 12000, balance: 683000, transactionId: 'row-1', direction: 'withdrawal', classification: { status: 'undecided' } }]),
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
  afterEach(() => { URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL; vi.restoreAllMocks(); });

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
    expect(screen.getByText(/PDF 생성 전에 영수증을 추가하고 연결/)).toBeInTheDocument();
  });

  it('blocks a normal PDF export until each payment has a linked receipt', async () => {
    render(<EvidenceExport reportEvidence={[{ id: 'receipt-1', stored: { id: 'stored-1', fileName: 'receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: '2026-09-29T00:00:00+09:00' }, section: 'receipt', order: 0 }]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[{ id: 'payment-1', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '카페', amount: 10000, status: 'classified', bucket: 'resident', category: 'food' }]} />);
    await screen.findByText('receipt.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    expect(await screen.findByText(/영수증이 연결되지 않은 결제 1건/)).toBeInTheDocument();
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
