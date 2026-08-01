import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge, notificationBridge } = vi.hoisted(() => ({ smsBridge: { configure: vi.fn(), requestPermission: vi.fn(), consumePendingApprovals: vi.fn() }, notificationBridge: { requestPermission: vi.fn(), show: vi.fn() } }));
vi.mock('./native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('./native/notificationBridge', () => ({ NotificationBridge: notificationBridge }));
import App from './App';
import { createTestApproval } from './native/testApproval';

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  smsBridge.configure.mockResolvedValue(undefined);
  smsBridge.requestPermission.mockResolvedValue({ granted: true });
  smsBridge.consumePendingApprovals.mockResolvedValue({ items: [] });
  notificationBridge.requestPermission.mockResolvedValue({ granted: true });
  notificationBridge.show.mockResolvedValue(undefined);
});

describe('support fund home', () => {
  it('creates a unique-looking Samsung Wellstory approval for the test tool', () => {
    expect(createTestApproval('3741', '2026-08-01T13:30:00+09:00')).toEqual({ cardLast4: '3741', occurredAt: '2026-08-01T13:30:00+09:00', amount: 30000, merchant: '삼성웰스토리(주)크래프톤정' });
  });
  it('shows the primary budget summary and quick actions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '지원금 관리' })).toBeInTheDocument();
    expect(screen.getByText('406,600원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /정주비 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새 결제 확인' })).toBeInTheDocument();
  });

  it('opens a budget detail in a bottom sheet', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /정주비 상세 보기/ }));
    expect(screen.getByRole('dialog', { name: '정주비 상세' })).toBeInTheDocument();
    expect(screen.getByText('주거비')).toBeInTheDocument();
  });

  it('configures the card and requests SMS permission', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('카드 끝 4자리'), { target: { value: '3741' } });
    fireEvent.click(screen.getByRole('button', { name: 'SMS 수신 사용' }));
    await waitFor(() => expect(smsBridge.configure).toHaveBeenCalledWith({ cardLast4: '3741' }));
    expect(smsBridge.requestPermission).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('SMS 수신을 사용할 수 있습니다.');
  });

  it('uses a pending native approval in the payment confirmation sheet', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '삼성웰스토리(주)크래프톤정' }] });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    expect(await screen.findByText('삼성웰스토리(주)크래프톤정')).toBeInTheDocument();
    expect(screen.getByText('학습공간 지원비 · 카페')).toBeInTheDocument();
  });

  it('persists an automatic classification and refreshes the support balance', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: '삼성웰스토리(주)크래프톤정' }] });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    await screen.findByText('학습공간 지원비 · 카페');
    fireEvent.click(screen.getByRole('button', { name: '자동 분류 적용' }));
    expect(screen.getByText('401,600원')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('학습공간 지원비 · 카페로 저장했습니다.');
    expect(window.localStorage.getItem('shinhanhae-ledger-v1')).toContain('5000');
  });
  it('reviews copied policy text before saving its limits', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: '숙박비 100,000원 식비 200,000원 교통비 250,000원 카페 200,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    expect(screen.getByText('550,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '검토 후 정책 확정' }));
    expect(screen.getByText('456,600원')).toBeInTheDocument();
    expect(window.localStorage.getItem('shinhanhae-policy-v1')).toContain('100000');
  });
  it('allows editing a support-item amount before policy confirmation', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: '숙박비 50,000원 식비 200,000원 교통비 250,000원 카페 200,000원' } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    fireEvent.change(screen.getByLabelText('주거비 계획 금액'), { target: { value: '60000' } });
    expect(screen.getByText('510,000원')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '검토 후 정책 확정' }));
    expect(window.localStorage.getItem('shinhanhae-policy-v1')).toContain('60000');
  });
  it('keeps the saved policy source and editable amounts when settings reopen', () => {
    const source = '숙박비 60,000원 식비 200,000원 교통비 250,000원 카페 200,000원';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: source } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    fireEvent.click(screen.getByRole('button', { name: '검토 후 정책 확정' }));
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    expect(screen.getByLabelText('계획표 내용')).toHaveValue(source);
    expect(screen.getByLabelText('주거비 계획 금액')).toHaveValue(60000);
  });
  it('lets a saved undecided payment be assigned to a support item', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 5000, merchant: 'Unknown shop' }] });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    await screen.findByText('Unknown shop');
    fireEvent.click(screen.getByRole('button', { name: '미정으로 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '미정 지출 1건' }));
    fireEvent.click(screen.getByRole('button', { name: '교통비' }));
    expect(screen.getByRole('status')).toHaveTextContent('교통비로 분류했습니다.');
    expect(screen.getByRole('button', { name: '미정 지출 0건' })).toBeInTheDocument();
  });
  it('sends a budget alert when manual classification crosses a threshold', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-08-01T15:00:00+09:00', amount: 50000, merchant: 'Unknown shop' }] });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    await screen.findByText('Unknown shop');
    fireEvent.click(screen.getByRole('button', { name: '미정으로 저장' }));
    fireEvent.click(screen.getByRole('button', { name: '미정 지출 1건' }));
    fireEvent.click(screen.getByRole('button', { name: '교통비' }));
    await waitFor(() => expect(notificationBridge.show).toHaveBeenCalledWith(expect.objectContaining({ title: '지원금 사용 경고' })));
  });  it('requires explicit confirmation before removing a recent payment from the budget', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '최근 결제 보기' }));
    fireEvent.click(screen.getAllByRole('button', { name: '이 결제 취소 확인' })[0]);
    expect(screen.getByRole('dialog', { name: '취소 확인' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소 확정' }));
    expect(screen.getByRole('status')).toHaveTextContent('취소 결제로 처리했습니다. 예산 사용액에서 제외됩니다.');
  });
  it('sends a direct test notification from the development tools', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '테스트 알림 보내기' }));
    await waitFor(() => expect(notificationBridge.show).toHaveBeenCalledWith({ title: '지원금 알림 테스트', body: '알림 권한과 표시 상태가 정상입니다.' }));
  });  it('persists alert thresholds and requests Android notification permission', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.change(screen.getByLabelText('첫 번째 경고 기준'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: '예산 경고 알림 사용' }));
    await waitFor(() => expect(notificationBridge.requestPermission).toHaveBeenCalledOnce());
    expect(window.localStorage.getItem('shinhanhae-ledger-v1')).toContain('[55,80]');
  });

  it('sends an alert when a confirmed payment crosses a saved threshold', async () => {
    smsBridge.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '3741', occurredAt: '2026-07-24T17:58:00+09:00', amount: 30000, merchant: '삼성웰스토리(주)크래프톤정' }] });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    await screen.findByText('삼성웰스토리(주)크래프톤정');
    fireEvent.click(screen.getByRole('button', { name: '자동 분류 적용' }));
    await waitFor(() => expect(notificationBridge.show).toHaveBeenCalledWith(expect.objectContaining({ title: '지원금 사용 경고' })));
  });
});