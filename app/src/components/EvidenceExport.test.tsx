import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceExport } from './EvidenceExport';

vi.mock('../native/evidenceVault', () => ({
  loadEvidence: vi.fn(async () => new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })),
  removeStoredEvidence: vi.fn(),
  storeEvidence: vi.fn(async (file: File) => ({ id: 'stored-upload', fileName: file.name, mimeType: file.type, size: file.size, attachedAt: '2026-09-29T00:00:00+09:00' })),
}));
vi.mock('../domain/shinhanBankImport', () => ({
  parseShinhanBankPdfExport: vi.fn(async () => [{ source: 'bankCsv', occurredAt: '2026-09-20T12:00:00+09:00', merchant: '개인 결제처', summary: '체크카드', amount: 12000, balance: 683000, transactionId: 'row-1', direction: 'withdrawal', classification: { status: 'undecided' } }]),
}));

const summary = {
  periodLabel: '2026년 9월', totalBudget: 700000, totalUsed: 10000,
  buckets: [{ key: 'resident' as const, label: '정주비', budget: 500000, used: 10000, items: [{ category: 'food', label: '식비', budget: 200000, used: 10000 }] }, { key: 'studySpace' as const, label: '학습공간비', budget: 200000, used: 0, items: [] }],
};

function StatefulEvidenceExport() {
  const [reportEvidence, setReportEvidence] = useState<ComponentProps<typeof EvidenceExport>['reportEvidence']>([]);
  return <EvidenceExport reportEvidence={reportEvidence} onReportEvidenceChange={setReportEvidence} summary={summary} periodKey="2026-09" entries={[]} />;
}

describe('EvidenceExport', () => {
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
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect(screen.getByText(/입출금 1행 · 제외 1행/)).toBeInTheDocument());
  });
});
