import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionImport } from './TransactionImport';

const mocks = vi.hoisted(() => ({
  readSelectedFile: vi.fn(async () => new ArrayBuffer(8)),
  parseCard: vi.fn(),
  parseBankPdf: vi.fn(),
  filterCard: vi.fn(),
}));

vi.mock('../native/fileRead', () => ({ readSelectedFile: mocks.readSelectedFile }));
vi.mock('../native/externalApp', () => ({ openShinhanSolPay: vi.fn() }));
vi.mock('../domain/shinhanImport', () => ({ parseShinhanCardExport: mocks.parseCard }));
vi.mock('../domain/shinhanBankImport', () => ({ parseShinhanBankPdfExport: mocks.parseBankPdf, getMaskedAccountLast4: (value?: string) => value?.slice(-4) }));
vi.mock('../domain/cardImportSafety', () => ({ filterTransactionsForConfiguredCard: mocks.filterCard }));

describe('transaction import', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('imports only current-period card CSV rows and reports excluded rows', async () => {
    const current = { occurredAt: '2026-09-20T12:00:00+09:00', merchant: '현재 카페', amount: 5000, cardMasked: '111*', cardIdentity: '1111', approvalNumber: '0001', paymentStatus: '승인', cancellationStatus: '', classification: { status: 'undecided' } };
    const outside = { ...current, occurredAt: '2026-09-13T12:00:00+09:00', approvalNumber: '0002' };
    mocks.parseCard.mockResolvedValue([current, outside]);
    mocks.filterCard.mockReturnValue({ status: 'ready', transactions: [current, outside], hasMaskedCardWarning: false });
    const onImport = vi.fn(); const { container } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={onImport} notify={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['csv'], 'card.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/1건의 기간 내 신한카드 내역/)).toBeInTheDocument();
    expect(screen.getByText(/기간 외 1건은 가져오지 않습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '내역 가져오기' }));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ source: 'card', identifierLast4: '1111', cardTransactions: [current], excludedOutsidePeriod: 1 }));
  });

  it('imports only withdrawals from a current-period bank PDF as undecided candidates', async () => {
    mocks.parseBankPdf.mockResolvedValue([
      { occurredAt: '2026-09-20T12:00:00+09:00', merchant: '현재 출금', amount: 5000, accountMasked: '6789', transactionId: 'withdrawal', direction: 'withdrawal', classification: { status: 'undecided' } },
      { occurredAt: '2026-09-20T12:01:00+09:00', merchant: '입금', amount: 700000, accountMasked: '6789', transactionId: 'deposit', direction: 'deposit', classification: { status: 'undecided' } },
      { occurredAt: '2026-09-13T12:00:00+09:00', merchant: '기간 외 출금', amount: 3000, accountMasked: '6789', transactionId: 'outside', direction: 'withdrawal', classification: { status: 'undecided' } },
    ]);
    const onImport = vi.fn(); const { container, getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={onImport} notify={vi.fn()} />);
    fireEvent.click(getByLabelText('계좌번호'));
    fireEvent.change(getByLabelText('계좌 끝 4자리'), { target: { value: '6789' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['pdf'], 'bank.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/1건의 기간 내 출금 내역/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '내역 가져오기' }));
    expect(onImport).toHaveBeenCalledWith(expect.objectContaining({ source: 'account', identifierLast4: '6789', excludedOutsidePeriod: 1, bankTransactions: [expect.objectContaining({ merchant: '현재 출금', direction: 'withdrawal' })] }));
  });

  it('requires an explicit continue action when the selected file has no readable identifier', async () => {
    const transaction = { occurredAt: '2026-09-20T12:00:00+09:00', merchant: '식당', amount: 8000, approvalNumber: '0003', paymentStatus: '승인', cancellationStatus: '', classification: { status: 'undecided' } };
    mocks.parseCard.mockResolvedValue([transaction]);
    mocks.filterCard.mockReturnValue({ status: 'warning', transactions: [transaction], hasMaskedCardWarning: true });
    const { container } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['csv'], 'card.csv', { type: 'text/csv' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/파일 안에서 4자리를 확인할 수 없습니다/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '확인 후 계속 진행' })).toBeInTheDocument();
  });

  it('passes a bank PDF password only to the selected-file parser', async () => {
    mocks.parseBankPdf.mockResolvedValue([{ occurredAt: '2026-09-20T12:00:00+09:00', merchant: '현재 출금', amount: 5000, accountMasked: '6789', transactionId: 'withdrawal-password', direction: 'withdrawal', classification: { status: 'undecided' } }]);
    const { container, getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);
    fireEvent.click(getByLabelText('계좌번호'));
    fireEvent.change(getByLabelText('계좌 끝 4자리'), { target: { value: '6789' } });
    fireEvent.change(getByLabelText('PDF 비밀번호'), { target: { value: '950504' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['pdf'], 'bank.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    await screen.findByText(/1건의 기간 내 출금 내역/);
    expect(mocks.parseBankPdf).toHaveBeenLastCalledWith(expect.any(ArrayBuffer), '950504');
  });

  it('rejects a bank PDF whose readable account suffix differs from the selected account', async () => {
    mocks.parseBankPdf.mockResolvedValue([{ occurredAt: '2026-09-20T12:00:00+09:00', merchant: '다른 계좌 출금', amount: 5000, accountMasked: '0000', transactionId: 'wrong-account', direction: 'withdrawal', classification: { status: 'undecided' } }]);
    const notify = vi.fn(); const { container, getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={notify} />);
    fireEvent.click(getByLabelText('계좌번호'));
    fireEvent.change(getByLabelText('계좌 끝 4자리'), { target: { value: '6789' } });
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['pdf'], 'bank.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/선택한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다/)).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('선택한 계좌 끝 4자리와 파일의 계좌 정보가 다릅니다'));
  });

  it('switches accepted formats without changing the configured notification card', () => {
    const { container, getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input).toHaveAttribute('accept', expect.stringContaining('.xls'));
    expect(input?.getAttribute('accept')).toContain('.csv');
    expect(container.textContent).toContain('CSV');
    expect(container.textContent).toContain('신한카드 앱 열기');
    const video = container.querySelector('video');
    expect(video).toHaveAttribute('loop');
    expect(video?.muted).toBe(true);
    expect(video?.querySelector('source')).toHaveAttribute('src', '/onboarding-shinhan-solpay-excel-guide.mp4');
    act(() => { fireEvent.click(getByLabelText('계좌번호')); });
    expect(input).toHaveAttribute('accept', expect.stringContaining('.pdf'));
    expect(getByLabelText('계좌 끝 4자리')).toHaveValue('');
    expect(getByLabelText('PDF 비밀번호')).toHaveAttribute('type', 'password');
  });

  it('clears the PDF password when the import type changes', () => {
    const { getByLabelText } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={vi.fn()} />);
    fireEvent.click(getByLabelText('계좌번호'));
    fireEvent.change(getByLabelText('PDF 비밀번호'), { target: { value: 'temporary-password' } });
    fireEvent.click(getByLabelText('카드번호'));
    fireEvent.click(getByLabelText('계좌번호'));
    expect(getByLabelText('PDF 비밀번호')).toHaveValue('');
  });

  it('blocks an unexpected file type before it reaches the parser', async () => {
    const notify = vi.fn(); const { container } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={notify} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File(['pdf'], 'card.pdf', { type: 'application/pdf' })] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/신한카드 CSV 또는 Excel 파일만 읽을 수 있습니다/)).toBeInTheDocument();
    expect(mocks.parseCard).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('신한카드 CSV 또는 Excel 파일만 읽을 수 있습니다'));
  });

  it('blocks an oversized import before reading it into memory', async () => {
    const oversized = new File(['csv'], 'card.csv', { type: 'text/csv' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });
    const notify = vi.fn(); const { container } = render(<TransactionImport cardLast4="1111" periodKey="2026-09" onImport={vi.fn()} notify={notify} />);
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [oversized] } });
    fireEvent.click(screen.getByRole('button', { name: '파일 읽기' }));
    expect(await screen.findByText(/10MB 이하만 읽을 수 있습니다/)).toBeInTheDocument();
    expect(mocks.readSelectedFile).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('10MB 이하만 읽을 수 있습니다'));
  });
});
