import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge, widgetBridge } = vi.hoisted(() => ({
  widgetBridge: { sync: vi.fn() },
  smsBridge: { addListener: vi.fn(), configure: vi.fn(), clearConfiguration: vi.fn(), getConfiguration: vi.fn(), syncBudgetState: vi.fn(), injectTestApproval: vi.fn(), injectTestNotificationApproval: vi.fn(), scheduleTestApproval: vi.fn(), getNotificationAccessStatus: vi.fn(), openNotificationAccessSettings: vi.fn(), consumePendingApprovals: vi.fn(), acknowledgePendingApprovals: vi.fn(), consumePendingApprovalReviews: vi.fn(), acknowledgePendingApprovalReviews: vi.fn(), consumePendingCancellations: vi.fn(), acknowledgePendingCancellations: vi.fn() },
  notificationBridge: { requestPermission: vi.fn(), getPermissionStatus: vi.fn(), openNotificationSettings: vi.fn(), show: vi.fn() },
}));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('./native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
vi.mock('./native/widgetBridge', () => ({ WidgetBridge: widgetBridge }));
import App from './App';
import { previousPanel } from './domain/navigation';
import { getPolicyPeriodKey } from './domain/budget';
import { createEmptyLedger } from './domain/ledger';
import { createMerchantRule, MERCHANT_RULES_STORAGE_KEY } from './domain/merchantRules';
import { APP_INFORMATION_ACK_KEY, APP_INFORMATION_TITLE } from './domain/appInformation';

let approvalListener: (() => void) | null = null;

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
  approvalListener = null;
  smsBridge.addListener.mockImplementation(async (_eventName, listener: () => void) => {
    approvalListener = listener;
    return { remove: vi.fn().mockResolvedValue(undefined) };
  });
  smsBridge.syncBudgetState.mockResolvedValue(undefined);
  smsBridge.consumePendingApprovals.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingApprovals.mockResolvedValue(undefined);
  smsBridge.consumePendingApprovalReviews.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingApprovalReviews.mockResolvedValue(undefined);
  smsBridge.consumePendingCancellations.mockResolvedValue({ items: [] });
  smsBridge.acknowledgePendingCancellations.mockResolvedValue(undefined);
  smsBridge.getNotificationAccessStatus.mockResolvedValue({ granted: true });
  smsBridge.openNotificationAccessSettings.mockResolvedValue(undefined);
  notificationBridge.getPermissionStatus.mockResolvedValue({ granted: true });
  notificationBridge.openNotificationSettings.mockResolvedValue(undefined);
  widgetBridge.sync.mockResolvedValue(undefined);
});

describe('app entry flows', () => {
  it.each(['No', '넘어가기'])('shows the disclosure once after %s and keeps it confirmed on restart', async (choice) => {
    const app = await renderApp(false);
    await screen.findByRole('button', { name: 'Yes' });
    expect(screen.queryByRole('dialog', { name: APP_INFORMATION_TITLE })).not.toBeInTheDocument();
    if (choice === '넘어가기') fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(await screen.findByRole('button', { name: choice }));
    await screen.findByRole('dialog', { name: APP_INFORMATION_TITLE });
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBeNull();
    expect(app.container.querySelector('.dashboard-surface')).toHaveAttribute('inert');
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: APP_INFORMATION_TITLE })).not.toBeInTheDocument());
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBe('confirmed');
    app.unmount(); await renderApp(false);
    expect(screen.queryByRole('dialog', { name: APP_INFORMATION_TITLE })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    expect(screen.queryByText('필요한 설정만 선택해 관리하세요.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /앱 안내·정보 출처/ }));
    expect(screen.getByRole('heading', { name: APP_INFORMATION_TITLE })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
    expect(screen.getByRole('heading', { name: '설정' })).toBeInTheDocument();
  });
  it.each(['dashboard', 'import'])('defers the notice until the actual dashboard after normal onboarding: %s', async (route) => {
    localStorage.setItem('shinhanhae-onboarding-progress-v1', JSON.stringify({ step: 'policy', policy: { plans: { housing: 300000, food: 200000, education: 0, transport: 0, studyCafe: 0, cafe: 200000, readingRoom: 0 }, sourceText: 'saved plan', profileId: 'shinhanhae-70', alertTargets: [] } }));
    await renderApp(false);
    fireEvent.click(await screen.findByRole('button', { name: '정책 확정' }));
    fireEvent.click(await screen.findByRole('button', { name: route === 'import' ? /결제한 적이 있어요/ : /아직 사용 전이에요/ }));
    if (route === 'import') {
      await screen.findByRole('button', { name: '나중에 등록하기' });
      expect(screen.queryByRole('dialog', { name: APP_INFORMATION_TITLE })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '나중에 등록하기' }));
    }
    expect(await screen.findByRole('dialog', { name: APP_INFORMATION_TITLE })).toBeInTheDocument();
  });
  it('shows the notice to existing users until explicitly confirmed, without replacing their plan', async () => {
    const book = { versions: [], mode: 'not-applicant' };
    localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify(book));
    const app = await renderApp(false);
    await screen.findByRole('dialog', { name: APP_INFORMATION_TITLE });
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBeNull();
    app.unmount(); await renderApp(false);
    expect(await screen.findByRole('dialog', { name: APP_INFORMATION_TITLE })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('shinhanhae-policy-book-v1')!)).toEqual(book);
    expect(previousPanel('information')).toBe('settings');
  });
  it('classifies only the subsidy portion, preserves it on reload, and guides partial cancellation back through undecided', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-20T12:00:00+09:00'));
    const now = new Date().toISOString();
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify({ ...createEmptyLedger(), entries: [{ id: 'portion', cardLast4: '1234', occurredAt: now, amount: 50000, merchant: '일부 지원금 결제', status: 'undecided' }] }));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: '2026-09', confirmedAt: now, sourceText: 'plan', plans: { housing: 0, food: 200000, education: 200000, transport: 100000, studyCafe: 0, cafe: 200000, readingRoom: 0 } }] }));
    const app = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '미정 지출 1건' }));
    fireEvent.click(screen.getByLabelText('일부 지원금 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '일부 지원금 결제 지원금 반영 금액 수정' }));
    fireEvent.change(screen.getByLabelText('일부 지원금 결제 지원금 반영 금액'), { target: { value: '30000' } });
    fireEvent.change(screen.getByLabelText('미정 지출 일괄 분류'), { target: { value: 'food' } });
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    fireEvent.click(screen.getByRole('button', { name: '미정 지출 닫기' }));
    expect(app.container.querySelector('.summary')).toHaveTextContent('30,000원 사용');
    await waitFor(() => expect(smsBridge.syncBudgetState).toHaveBeenLastCalledWith(expect.objectContaining({ categorySpent: expect.objectContaining({ food: 30000 }) })));
    fireEvent.click(screen.getByRole('button', { name: '결제 내역 확인' }));
    fireEvent.click(screen.getByRole('button', { name: /일부 지원금 결제/ }));
    expect(screen.getByText('지원금 반영 30,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소 확인' }));
    fireEvent.change(screen.getByLabelText('취소 금액'), { target: { value: '35000' } });
    fireEvent.click(screen.getByRole('button', { name: '부분 취소 확정' }));
    fireEvent.click(screen.getByRole('button', { name: /일부 지원금 결제/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('부분 취소 · 금액 재확인 필요');
    fireEvent.click(screen.getByRole('button', { name: '미정으로 되돌리기' }));
    expect(screen.getByText('이전 지원금 반영 30,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('일부 지원금 결제 선택'));
    fireEvent.click(screen.getByRole('button', { name: '일부 지원금 결제 지원금 반영 금액 수정' }));
    fireEvent.change(screen.getByLabelText('일부 지원금 결제 지원금 반영 금액'), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText('미정 지출 일괄 분류'), { target: { value: 'food' } });
    fireEvent.click(screen.getByRole('button', { name: '바로 분류' }));
    fireEvent.click(screen.getByRole('button', { name: '미정 지출 닫기' }));
    await waitFor(() => expect(app.container.querySelector('.summary')).toHaveTextContent('10,000원 사용'));
    await act(async () => { await Promise.resolve(); }); app.unmount();
    const reopened = await renderApp();
    expect(reopened.container.querySelector('.summary')).toHaveTextContent('10,000원 사용');
  });

  it('adjusts unused budget, preserves spending/evidence/scheduled policy and reloads the final plan', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00+09:00'));
    const now = new Date().toISOString(); const periodKey = getPolicyPeriodKey(new Date());
    const plans = { housing: 0, food: 200000, education: 200000, transport: 100000, studyCafe: 0, cafe: 200000, readingRoom: 0 };
    const currentVersion = { periodKey, confirmedAt: now, sourceText: 'original plan', plans, profileId: 'shinhanhae-70', alertTargets: [] };
    const nextVersion = { ...currentVersion, periodKey: '2099-10' };
    const entry = { id: 'transport-payment', cardLast4: '1234', merchant: '교통비 결제', occurredAt: now, amount: 30000, cancelledAmount: 10000, status: 'classified', bucket: 'resident', category: 'transport' };
    const ledger = { ...createEmptyLedger(), entries: [entry] };
    const evidence = [{ id: 'saved-receipt', section: 'receipt', order: 0, linkedEntryId: entry.id, stored: { id: 'saved-image', fileName: 'saved-receipt.jpg', mimeType: 'image/jpeg', size: 10, attachedAt: now } }];
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(ledger));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [currentVersion, nextVersion] }));
    window.localStorage.setItem('shinhanhae-report-evidence-v1', JSON.stringify(evidence));
    const app = await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '정주비 상세 보기' }));
    expect(screen.getByLabelText('예산 가져올 항목')).toHaveTextContent('교통비 · 이동 가능 80,000원');
    fireEvent.change(screen.getByLabelText('예산 가져올 항목'), { target: { value: 'transport' } });
    fireEvent.change(screen.getByLabelText('예산 받을 항목'), { target: { value: 'housing' } });
    fireEvent.change(screen.getByLabelText('예산 이동 금액'), { target: { value: '80001' } });
    expect(screen.getByRole('button', { name: '예산 조정 적용' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('예산 이동 금액'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: '예산 조정 적용' }));
    await screen.findByText(/예산을 조정했습니다/);
    const saved = JSON.parse(window.localStorage.getItem('shinhanhae-policy-book-v1')!);
    expect(saved.versions.find((version: { periodKey: string }) => version.periodKey === periodKey).plans).toMatchObject({ housing: 50000, transport: 50000 });
    expect(saved.versions.find((version: { periodKey: string }) => version.periodKey === '2099-10')).toEqual(nextVersion);
    expect(JSON.parse(window.localStorage.getItem('shinhanhae-ledger-v1')!)).toEqual(ledger);
    expect(JSON.parse(window.localStorage.getItem('shinhanhae-report-evidence-v1')!)).toEqual(evidence);
    await waitFor(() => expect(smsBridge.syncBudgetState).toHaveBeenLastCalledWith(expect.objectContaining({ categoryLimits: expect.objectContaining({ lodging: 50000, transport: 50000 }), categorySpent: expect.objectContaining({ transport: 20000 }) })));
    app.unmount(); await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '정주비 상세 보기' }));
    const housingRow = screen.getByText('주거비', { selector: '.table strong' }).closest('.table>div');
    const transportRow = screen.getByText('교통비', { selector: '.table strong' }).closest('.table>div');
    expect(housingRow).toHaveTextContent('50,000원');
    expect(transportRow).toHaveTextContent('50,000원20,000원30,000원');
    fireEvent.click(screen.getByRole('button', { name: '정주비 상세 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /데이터 관리/ }));
    expect(await screen.findByText('예산 조정')).toBeInTheDocument();
  });
  it('resolves a cross-source duplicate from undecided expenses without changing confirmed spending', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00+09:00'));
    const original = { id: 'approval-1234-1', cardLast4: '1234', merchant: '메가커피', occurredAt: '2026-09-20T12:00:00+09:00', amount: 2700, status: 'classified', bucket: 'resident', category: 'food', source: 'excel' };
    const pending = { id: 'bank-6789-1', cardLast4: '6789', merchant: '네이버페이', occurredAt: '2026-09-20T12:00:23+09:00', amount: 2700, status: 'undecided', source: 'bankCsv', duplicateCandidateIds: [original.id] };
    const now = new Date().toISOString();
    original.occurredAt = now; pending.occurredAt = now;
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify({ ...createEmptyLedger(), entries: [original, pending] }));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: getPolicyPeriodKey(new Date()), confirmedAt: now, sourceText: 'saved policy', plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 } }] }));
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '미정 지출 1건' }));
    expect(screen.getByText('현재 중복 확인 필요 1건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem('shinhanhae-ledger-v1')!);
      expect(stored.entries).toHaveLength(1);
      expect(stored.entries[0]).toMatchObject({ id: original.id, category: 'food', amount: 2700, status: 'classified' });
    });
    expect(screen.queryByText('같은 거래인가요?')).not.toBeInTheDocument();
    expect(screen.queryByText(/현재 중복 확인 필요 [1-9]/)).not.toBeInTheDocument();
  });
  it('opens optional app guidance without changing data and places PDF help in the sheet header', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy', plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 } }] }));
    await renderApp();
    expect(screen.queryByRole('dialog', { name: '앱 사용 도움말' })).not.toBeInTheDocument();
    const before = window.localStorage.getItem('shinhanhae-policy-book-v1');
    fireEvent.click(await screen.findByRole('button', { name: '앱 사용 도움말' }));
    expect(screen.getByText('계획표 설정 · 거래내역 가져오기')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(window.localStorage.getItem('shinhanhae-policy-book-v1')).toBe(before);
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    const help = await screen.findByRole('button', { name: '도움말' });
    expect(help.closest('header')).not.toBeNull();
    fireEvent.click(help);
    expect(await screen.findByRole('dialog', { name: 'PDF 생성 도움말' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '건너뛰기' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF 생성' }));
    expect(screen.queryByRole('dialog', { name: 'PDF 생성 도움말' })).not.toBeInTheDocument();
  });
  it('routes Android back through nested sheets before leaving the dashboard', () => {
    expect(previousPanel('rules')).toBe('data');
    expect(previousPanel('data')).toBe('settings');
    expect(previousPanel('detail')).toBe('recent');
    expect(previousPanel('edit')).toBe('detail');
    expect(previousPanel('resident')).toBeNull();
  });
  it('asks whether a new user is an applicant before policy onboarding', async () => {
    await renderApp();
    expect(await screen.findByRole('heading', { name: /지원자인가요/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'No' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '지원금 관리' })).not.toBeInTheDocument();
  });

  it('opens direct expense registration instead of consuming the SMS queue', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '새 지출 직접 등록' }));
    expect(screen.getByRole('heading', { name: '직접 지출 등록' })).toBeInTheDocument();
    expect(screen.getByLabelText('상호명')).toBeInTheDocument();
    expect(smsBridge.consumePendingApprovals).not.toHaveBeenCalled();
  });
  it('stores a manually entered expense without acknowledging the SMS queue', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    window.localStorage.setItem(MERCHANT_RULES_STORAGE_KEY, JSON.stringify([createMerchantRule('테스트 카페', { bucket: 'studySpace', category: 'generalCafe' })]));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '새 지출 직접 등록' }));
    fireEvent.change(screen.getByLabelText('상호명'), { target: { value: '테스트 카페' } });
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: '지출 등록' }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText(/테스트 카페/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /테스트 카페/ }));
    expect(screen.getByRole('heading', { name: '결제 상세' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '수정 · 분류 변경' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소 확인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '삭제' })).toBeInTheDocument();
    expect(smsBridge.acknowledgePendingApprovals).not.toHaveBeenCalled();
  });

  it('keeps data-management sections collapsed and in the agreed order', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /데이터 관리/ }));

    const summaries = await screen.findAllByText(/^(거래내역|자동 분류 규칙|계획표|백업 · 복원|누락 가능성 점검|데이터 초기화)$/);
    expect(summaries.map((node) => node.textContent)).toEqual(['거래내역', '자동 분류 규칙', '계획표', '백업 · 복원', '누락 가능성 점검', '데이터 초기화']);
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
  });

  it('opens the transaction registration guide from data management', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /데이터 관리/ }));
    fireEvent.click(await screen.findByRole('button', { name: '거래내역 가져오기' }));
    expect(screen.getByRole('heading', { name: /결제내역을\s*등록할까요/ })).toBeInTheDocument();
  });

  it('shows the two notification controls with status-aware copy', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /운영 설정/ }));
    expect(screen.getByRole('button', { name: '결제 알림 수신 설정' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '예산 경고 알림 설정' })).toBeInTheDocument();
    expect(screen.queryByText('개발 테스트')).not.toBeInTheDocument();
  });
  it('clears the native card setting while a configured card number is being replaced', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.getConfiguration.mockResolvedValue({ cardLast4: '4321' });
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /운영 설정/ }));
    const cardInput = screen.getByLabelText('카드 끝 4자리');
    await waitFor(() => expect(cardInput).toHaveValue('4321'));
    fireEvent.change(cardInput, { target: { value: '374' } });
    expect(smsBridge.clearConfiguration).toHaveBeenCalledOnce();
    expect(screen.getByText(/카드 4자리를 모두 입력하면/)).toBeInTheDocument();
    fireEvent.change(cardInput, { target: { value: '1234' } });
    expect(smsBridge.configure).toHaveBeenLastCalledWith({ cardLast4: '1234' });
  });
  it('provides the privacy disclosure inside settings', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByText('개인정보 처리 안내'));
    expect(screen.getByText(/원문 알림과 다른 대화는 저장·전송·삭제하지 않습니다/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '전체 개인정보처리방침 보기' })).toHaveAttribute('href', 'https://cjsan30.github.io/shinhanaccount/privacy-policy.html');
  });
  it('preserves a confirmed policy and opens the dashboard for an existing user', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    expect(screen.getByRole('heading', { name: '지원금 관리' })).toBeInTheDocument();
    expect(screen.getByText('700,000원')).toBeInTheDocument();
  });

  it('keeps an automatically classified approval visible in history after the app remains open across midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-20T23:50:00+09:00'));
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    window.localStorage.setItem(MERCHANT_RULES_STORAGE_KEY, JSON.stringify([createMerchantRule('테스트 카페', { bucket: 'studySpace', category: 'generalCafe' })]));
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{
      id: 'sms-live-1', cardLast4: '4321', occurredAt: new Date(Date.now() + 86_400_000).toISOString(), amount: 5000, merchant: '테스트 카페', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    await waitFor(() => expect(smsBridge.acknowledgePendingApprovals).toHaveBeenCalledWith({ ids: ['sms-live-1'] }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText(/테스트 카페/)).toBeInTheDocument();
  });

  it('acknowledges but does not store an approval outside the confirmed policy period', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T12:00:00+09:00'));
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: '2026-09', confirmedAt: '2026-09-14T00:00:00+09:00', sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{
      id: 'policy-gap-approval', cardLast4: '4321', occurredAt: '2026-10-12T12:00:00+09:00', amount: 5000, merchant: '기간 밖 결제', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    await waitFor(() => expect(smsBridge.acknowledgePendingApprovals).toHaveBeenCalledWith({ ids: ['policy-gap-approval'] }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText('저장된 결제 내역이 없습니다.')).toBeInTheDocument();
  });

  it('counts widget item usage and quick categories only within the item bucket', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00+09:00'));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: '2026-09', confirmedAt: '2026-09-14T00:00:00+09:00', sourceText: 'saved policy',
      plans: { housing: 0, food: 200000, education: 0, transport: 0, studyCafe: 0, cafe: 200000, readingRoom: 0 },
      customItems: [{ id: 'gym', label: '운동비', bucket: 'studySpace', amount: 100000 }],
    }] }));
    const classified = (id: string, bucket: string, category: string, amount: number) => ({ id, cardLast4: '0000', occurredAt: '2026-09-18T10:00:00+09:00', amount, merchant: id, status: 'classified', bucket, category });
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify({ ...createEmptyLedger(), entries: [
      // Classified before the custom item moved from 정주비 to 학습공간비.
      classified('gym-before-move', 'resident', 'custom:gym', 30000),
      classified('food-wrong-bucket-1', 'studySpace', 'food', 5000),
      classified('food-wrong-bucket-2', 'studySpace', 'food', 5000),
      classified('cafe-1', 'studySpace', 'generalCafe', 4000),
    ] }));

    await renderApp();

    await waitFor(() => expect(widgetBridge.sync).toHaveBeenCalled());
    const rows = widgetBridge.sync.mock.lastCall![0].detailRows as Array<{ label: string; spent: number }>;
    expect(rows.find((row) => row.label === '운동비')?.spent).toBe(0);
    expect(rows.find((row) => row.label === '식비')?.spent).toBe(0);
    expect(rows.find((row) => row.label === '카페')?.spent).toBe(4000);
    expect(smsBridge.syncBudgetState.mock.lastCall![0].quickCategories[0].category).toBe('generalCafe');
  });

  it('returns a classified payment to the undecided panel from its detail screen', async () => {
    const occurredAt = new Date().toISOString();
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify({
      ...createEmptyLedger(),
      entries: [{ id: 'classified-1', cardLast4: '4321', occurredAt, amount: 8000, merchant: '되돌릴 결제', status: 'classified', bucket: 'resident', category: 'food' }],
    }));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    fireEvent.click(screen.getByRole('button', { name: /되돌릴 결제/ }));
    fireEvent.click(screen.getByRole('button', { name: '미정으로 되돌리기' }));
    expect(await screen.findByRole('heading', { name: '미정 지출' })).toBeInTheDocument();
    expect(screen.getByText('되돌릴 결제')).toBeInTheDocument();
    expect(screen.getAllByText(/분류 전에는 예산과 경고에 반영되지 않습니다/)).not.toHaveLength(0);
  });

  it('adds, edits, and deletes a contains-based merchant rule', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderApp();

    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /데이터 관리/ }));
    fireEvent.click(await screen.findByText('자동 분류 규칙'));
    fireEvent.click(await screen.findByRole('button', { name: '규칙 관리' }));
    fireEvent.change(screen.getByLabelText('규칙 상호명'), { target: { value: 'MegaCoffee' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 추가' }));

    expect(screen.getByText('MegaCoffee')).toBeInTheDocument();
    expect(screen.getByText('포함 · 식비')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '수정' }));
    fireEvent.change(screen.getByLabelText('규칙 인식 방법'), { target: { value: 'exact' } });
    fireEvent.click(screen.getByRole('button', { name: '규칙 수정 저장' }));
    expect(screen.getByText('정확히 일치 · 식비')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByText('저장된 자동 분류 규칙이 없습니다.')).toBeInTheDocument();
    confirm.mockRestore();
  });

  it('holds an incomplete approval for confirmation and acknowledges it only after registration', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-20T12:00:00+09:00'));
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingApprovalReviews.mockResolvedValue({ items: [{
      id: 'review-1', cardLast4: '4321', occurredAt: new Date().toISOString(), merchant: '확인 필요 결제', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    expect(await screen.findByRole('heading', { name: '결제 정보 확인' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('확인 필요 결제')).toBeInTheDocument();
    expect(smsBridge.acknowledgePendingApprovalReviews).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '12300' } });
    fireEvent.change(screen.getByLabelText('지출 분류'), { target: { value: 'food' } });
    fireEvent.click(screen.getByRole('button', { name: '확인 후 등록' }));

    await waitFor(() => expect(smsBridge.acknowledgePendingApprovalReviews).toHaveBeenCalledWith({ ids: ['review-1'] }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText('확인 필요 결제')).toBeInTheDocument();
  });

  it.each(['2026-10-11T12:00:00+09:00', '2026-10-12T12:00:00+09:00'])('discards an incomplete approval review outside the confirmed period without showing a form on %s', async (occurredAt) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(occurredAt));
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: '2026-09', confirmedAt: '2026-09-14T00:00:00+09:00', sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingApprovalReviews.mockResolvedValue({ items: [{
      id: 'period-gap-review', cardLast4: '4321', occurredAt, merchant: '기간 밖 확인 결제', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    await waitFor(() => expect(smsBridge.acknowledgePendingApprovalReviews).toHaveBeenCalledWith({ ids: ['period-gap-review'] }));
    expect(screen.queryByRole('heading', { name: '결제 정보 확인' })).not.toBeInTheDocument();
  });

  it('automatically applies and acknowledges one unambiguous cancellation notice', async () => {
    const occurredAt = new Date().toISOString();
    const ledger = {
      ...createEmptyLedger(),
      entries: [{ id: 'paid-1', cardLast4: '4321', occurredAt, amount: 12300, merchant: '취소 대상', status: 'classified', bucket: 'resident', category: 'food' }],
    };
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(ledger));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingCancellations.mockResolvedValue({ items: [{
      id: 'cancel-1', cardLast4: '4321', occurredAt: new Date(Date.now() + 60_000).toISOString(), amount: 12300, merchant: '취소 대상', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    await waitFor(() => expect(smsBridge.acknowledgePendingCancellations).toHaveBeenCalledWith({ ids: ['cancel-1'] }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText('취소됨')).toBeInTheDocument();
  });

  it('holds a partial cancellation for the user and labels its exact cancellation amount', async () => {
    const occurredAt = new Date().toISOString();
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify({
      ...createEmptyLedger(),
      entries: [{ id: 'paid-partial', cardLast4: '4321', occurredAt, amount: 12300, merchant: '부분 취소 대상', status: 'classified', bucket: 'resident', category: 'food' }],
    }));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingCancellations.mockResolvedValue({ items: [{
      id: 'partial-cancel-1', cardLast4: '4321', occurredAt: new Date(Date.now() + 60_000).toISOString(), amount: 3000, merchant: '부분 취소 대상', source: 'notification',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    expect(await screen.findByRole('heading', { name: '취소 결제 확인' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /부분 취소 3,000원/ })).toBeInTheDocument();
    expect(smsBridge.acknowledgePendingCancellations).not.toHaveBeenCalled();
  });
});

describe('new policy period for an existing user', () => {
  const plan = { housing: 0, food: 200000, education: 200000, transport: 100000, studyCafe: 0, cafe: 200000, readingRoom: 0 };
  it('keeps the dashboard and confirms the previous plan with one tap instead of repeating onboarding', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00+09:00'));
    localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: '2026-09', confirmedAt: '2026-09-15T09:00:00+09:00', sourceText: 'plan', plans: plan }] }));
    await renderApp();
    expect(await screen.findByText('이번 기간 계획표를 확정해 주세요')).toBeInTheDocument();
    expect(screen.queryByText('지원자인가요?')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '지난 계획 그대로 확정' }));
    expect(await screen.findByText('지난 계획을 이번 기간 계획으로 확정했습니다.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('이번 기간 계획표를 확정해 주세요')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('shinhanhae-policy-book-v1')!).versions.map((version: { periodKey: string }) => version.periodKey)).toEqual(['2026-09', '2026-10']);
  });

  it('opens the plan section when the user wants to edit before confirming', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00+09:00'));
    localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: '2026-09', confirmedAt: '2026-09-15T09:00:00+09:00', sourceText: 'plan', plans: plan }] }));
    await renderApp();
    fireEvent.click(await screen.findByRole('button', { name: '수정 후 확정' }));
    expect(await screen.findByLabelText('계획표 내용')).toBeVisible();
  });
});

describe('previous policy period evidence cleanup', () => {
  it('removes PDF files attached before the new policy period started and keeps newer ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-20T12:00:00+09:00'));
    const record = (id: string, attachedAt: string) => ({ id, section: 'receipt', order: 0, stored: { id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', size: 1, attachedAt } });
    localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{ periodKey: '2026-10', confirmedAt: '2026-10-15T09:00:00+09:00', sourceText: 'plan', plans: { housing: 0, food: 200000, education: 200000, transport: 100000, studyCafe: 0, cafe: 200000, readingRoom: 0 } }] }));
    localStorage.setItem('shinhanhae-report-evidence-v1', JSON.stringify([record('previous', '2026-10-12T09:00:00+09:00'), record('current', '2026-10-16T09:00:00+09:00')]));
    await renderApp();
    expect(await screen.findByText('새 기간이 시작되어 이전 기간 PDF 자료 1개를 정리했습니다.')).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem('shinhanhae-report-evidence-v1')!).map((item: { id: string }) => item.id)).toEqual(['current']));
  });
});
