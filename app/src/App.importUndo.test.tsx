import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge, widgetBridge } = vi.hoisted(() => ({
  widgetBridge: { sync: vi.fn() },
  smsBridge: { addListener: vi.fn(), configure: vi.fn(), clearConfiguration: vi.fn(), getConfiguration: vi.fn(), syncBudgetState: vi.fn(), injectTestApproval: vi.fn(), injectTestNotificationApproval: vi.fn(), scheduleTestApproval: vi.fn(), getNotificationAccessStatus: vi.fn(), openNotificationAccessSettings: vi.fn(), consumePendingApprovals: vi.fn(), acknowledgePendingApprovals: vi.fn(), consumePendingApprovalReviews: vi.fn(), acknowledgePendingApprovalReviews: vi.fn(), consumePendingCancellations: vi.fn(), acknowledgePendingCancellations: vi.fn(), consumePendingWithdrawals: vi.fn(), acknowledgePendingWithdrawals: vi.fn(), configureTopUpAccount: vi.fn() },
  notificationBridge: { requestPermission: vi.fn(), getPermissionStatus: vi.fn(), openNotificationSettings: vi.fn(), show: vi.fn() },
}));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('./native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
vi.mock('./native/widgetBridge', () => ({ WidgetBridge: widgetBridge }));
// The import page is replaced by two buttons that hand App a fixed card or bank result.
const { evidenceVault } = vi.hoisted(() => ({ evidenceVault: {
  storeEvidence: vi.fn(async (file: File) => ({ id: 'stored-statement', fileName: file.name, mimeType: file.type, size: file.size, attachedAt: '2026-11-18T12:00:00+09:00' })),
  removeStoredEvidence: vi.fn(async () => undefined),
  retryPendingEvidenceRemovals: vi.fn(async () => undefined),
  loadEvidence: vi.fn(),
} }));
vi.mock('./native/evidenceVault', () => evidenceVault);
vi.mock('./components/TransactionImport', () => ({
  TransactionImport: ({ onImport }: { onImport: (payload: unknown) => void }) => <>
    <button type="button" onClick={() => onImport({
      source: 'card', identifierLast4: '0000', excludedOutsidePeriod: 0, preview: {},
      cardTransactions: [{ occurredAt: '2026-11-17T12:10:00+09:00', cardMasked: '본인000*', merchant: '테스트 가져오기 식당', approvalNumber: '00001001', amount: 7000, paymentStatus: '승인', cancellationStatus: '' }],
    })}>테스트 파일 가져오기</button>
    <button type="button" onClick={() => onImport({
      source: 'account', identifierLast4: '0000', excludedOutsidePeriod: 0, preview: {},
      bankTransactions: [{ source: 'bankCsv', occurredAt: '2026-11-17T09:00:00+09:00', merchant: '테스트 출금', amount: 3000, transactionId: 't-1', direction: 'withdrawal' }],
      statement: { file: new File(['%PDF-test'], 'test-statement.pdf', { type: 'application/pdf' }), transactions: [], requiresPassword: false },
    })}>테스트 입출금 PDF 가져오기</button>
  </>,
}));
import App from './App';
import { getPolicyPeriodKey } from './domain/budget';
import { createEmptyLedger } from './domain/ledger';
import { APP_INFORMATION_ACK_KEY } from './domain/appInformation';


async function renderApp(acknowledgeNotice = true) {
  if (acknowledgeNotice) localStorage.setItem(APP_INFORMATION_ACK_KEY, 'confirmed');
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<App />);
    await Promise.resolve();
  });
  return result!;
}

afterEach(() => { vi.useRealTimers(); });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  smsBridge.getConfiguration.mockResolvedValue({ cardLast4: '' });
  smsBridge.addListener.mockImplementation(async () => ({ remove: vi.fn().mockResolvedValue(undefined) }));
  smsBridge.syncBudgetState.mockResolvedValue(undefined);
  smsBridge.consumePendingApprovals.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingApprovals.mockResolvedValue(undefined);
  smsBridge.consumePendingApprovalReviews.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingApprovalReviews.mockResolvedValue(undefined);
  smsBridge.consumePendingCancellations.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingCancellations.mockResolvedValue(undefined);
  smsBridge.consumePendingWithdrawals.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingWithdrawals.mockResolvedValue(undefined);
  smsBridge.configureTopUpAccount.mockResolvedValue(undefined);
  smsBridge.getNotificationAccessStatus.mockResolvedValue({ granted: true });
  smsBridge.openNotificationAccessSettings.mockResolvedValue(undefined);
  notificationBridge.getPermissionStatus.mockResolvedValue({ granted: true });
  notificationBridge.openNotificationSettings.mockResolvedValue(undefined);
  widgetBridge.sync.mockResolvedValue(undefined);
});

async function prepare() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T12:00:00+09:00'));
  window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
  window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
    periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
    plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
  }] }));
}

describe('undo the latest import (decision 2026-11-18)', () => {
  it('offers undo on the undecided screen right after a home-screen import and restores the previous ledger', async () => {
    await prepare();
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '거래내역 가져오기' }));
    fireEvent.click(await screen.findByRole('button', { name: '테스트 파일 가져오기' }));
    expect(await screen.findByText('테스트 가져오기 식당')).toBeInTheDocument();
    expect(screen.getByText('앱을 닫기 전까지만 되돌릴 수 있습니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '방금 가져온 내역 되돌리기' }));
    await waitFor(() => expect(screen.queryByText('테스트 가져오기 식당')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: '방금 가져온 내역 되돌리기' })).not.toBeInTheDocument();
    expect(screen.queryByText('가져오기 결과')).not.toBeInTheDocument();
  });

  it('also removes the statement PDF the import added to 사용보고서', async () => {
    await prepare();
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '거래내역 가져오기' }));
    fireEvent.click(await screen.findByRole('button', { name: '테스트 입출금 PDF 가져오기' }));
    expect(await screen.findByText('테스트 출금')).toBeInTheDocument();
    await waitFor(() => expect(evidenceVault.storeEvidence).toHaveBeenCalledOnce());
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: '방금 가져온 내역 되돌리기' }));
    await waitFor(() => expect(evidenceVault.removeStoredEvidence).toHaveBeenCalledWith(expect.objectContaining({ id: 'stored-statement' })));
    expect(await screen.findByText('방금 가져온 결제 내역과 사용보고서에 추가한 입출금내역 PDF를 되돌렸습니다.')).toBeInTheDocument();
    expect(screen.queryByText('테스트 출금')).not.toBeInTheDocument();
  });
});
