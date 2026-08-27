import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge } = vi.hoisted(() => ({
  smsBridge: { addListener: vi.fn(), configure: vi.fn(), getConfiguration: vi.fn(), syncBudgetState: vi.fn(), injectTestApproval: vi.fn(), injectTestNotificationApproval: vi.fn(), scheduleTestApproval: vi.fn(), getNotificationAccessStatus: vi.fn(), openNotificationAccessSettings: vi.fn(), consumePendingApprovals: vi.fn(), acknowledgePendingApprovals: vi.fn() },
  notificationBridge: { requestPermission: vi.fn(), getPermissionStatus: vi.fn(), openNotificationSettings: vi.fn(), show: vi.fn() },
}));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('./native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
import App from './App';
import { previousPanel } from './domain/navigation';
import { getPolicyPeriodKey } from './domain/budget';
import { createEmptyLedger } from './domain/ledger';

let approvalListener: (() => void) | null = null;

async function renderApp() {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(<App />);
    await Promise.resolve();
  });
  return result!;
}

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
  smsBridge.getNotificationAccessStatus.mockResolvedValue({ granted: true });
  smsBridge.openNotificationAccessSettings.mockResolvedValue(undefined);
  notificationBridge.getPermissionStatus.mockResolvedValue({ granted: true });
  notificationBridge.openNotificationSettings.mockResolvedValue(undefined);
});

describe('app entry flows', () => {
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
    await renderApp();
    fireEvent.click(screen.getByRole('button', { name: '새 지출 직접 등록' }));
    fireEvent.change(screen.getByLabelText('상호명'), { target: { value: '삼성웰스토리' } });
    fireEvent.change(screen.getByLabelText('금액'), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: '지출 등록' }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText(/삼성웰스토리/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /삼성웰스토리/ }));
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
    fireEvent.click(await screen.findByRole('button', { name: '거래내역 등록 가이드' }));
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

  it('applies a native approval event while the dashboard remains open', async () => {
    window.localStorage.setItem('shinhanhae-ledger-v1', JSON.stringify(createEmptyLedger()));
    window.localStorage.setItem('shinhanhae-policy-book-v1', JSON.stringify({ versions: [{
      periodKey: getPolicyPeriodKey(new Date()), confirmedAt: new Date().toISOString(), sourceText: 'saved policy',
      plans: { housing: 50000, food: 200000, education: 0, transport: 250000, studyCafe: 0, cafe: 200000, readingRoom: 0 },
    }] }));
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{
      id: 'sms-live-1', cardLast4: '3741', occurredAt: new Date().toISOString(), amount: 5000, merchant: '삼성웰스토리', source: 'sms',
    }] });

    await renderApp();
    await act(async () => { approvalListener?.(); });

    await waitFor(() => expect(smsBridge.acknowledgePendingApprovals).toHaveBeenCalledWith({ ids: ['sms-live-1'] }));
    fireEvent.click(screen.getByRole('button', { name: /결제 내역 확인/ }));
    expect(screen.getByText(/삼성웰스토리/)).toBeInTheDocument();
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
});
