import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPolicy } from '../domain/policy';
import { OnboardingFlow } from './OnboardingFlow';

const mocks = vi.hoisted(() => ({ configure: vi.fn(), consumePendingApprovals: vi.fn() }));

vi.mock('./FirstRunPermission', () => ({
  FirstRunPermission: ({ onComplete, onSkip }: { onComplete: (card: string) => void; onSkip: () => void }) => <section><button type="button" onClick={() => onComplete('4321')}>권한 완료</button><button type="button" onClick={onSkip}>권한 건너뛰기</button></section>,
}));
vi.mock('./PolicyOnboarding', () => ({
  PolicyOnboarding: ({ onConfirm }: { onConfirm: (policy: typeof emptyPolicy) => void }) => <button type="button" onClick={() => onConfirm(emptyPolicy)}>정책 확정</button>,
}));
vi.mock('../native/smsBridge', () => ({ SmsBridge: { configure: mocks.configure, consumePendingApprovals: mocks.consumePendingApprovals } }));

describe('onboarding flow', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); mocks.configure.mockResolvedValue(undefined); mocks.consumePendingApprovals.mockResolvedValue({ items: [] }); });

  it('sends a non-applicant directly to the dashboard without configuring a card', () => {
    const onComplete = vi.fn(); render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ applicantStatus: 'not-applicant', cardLast4: '', nextAction: 'dashboard' }));
    expect(mocks.configure).not.toHaveBeenCalled();
  });

  it('shows a bottom notice and an external homepage link without advancing onboarding', () => {
    const onComplete = vi.fn(); const app = render(<OnboardingFlow onComplete={onComplete} />);
    const link = screen.getByRole('link', { name: '사업 정보 출처 확인' });
    expect(link).toHaveAttribute('href', 'https://shinchunghae.co.kr/');
    expect(link).toHaveAttribute('target', '_blank');
    expect(app.container.querySelector('.onboarding-app-notice')).toContainElement(link);
    // Emulate opening an external target; the app itself never changes routes.
    link.addEventListener('click', (event) => event.preventDefault(), { once: true }); fireEvent.click(link);
    expect(screen.getByRole('button', { name: 'Yes' })).toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled(); expect(mocks.configure).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not persist a card suffix while a support-applicant onboarding is in progress', async () => {
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 완료' }));
    await screen.findByRole('button', { name: '정책 확정' });
    expect(mocks.configure).toHaveBeenCalledWith({ cardLast4: '4321' });
    expect(localStorage.getItem('shinhanhae-onboarding-progress-v1')).not.toContain('4321');
  });

  it('completes the policy and routes prior-card users to transaction import', async () => {
    const onComplete = vi.fn(); mocks.consumePendingApprovals.mockResolvedValue({ items: [{ cardLast4: '4321', occurredAt: '2026-09-20T12:00:00+09:00', amount: 5000, merchant: '카페' }] });
    render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 완료' }));
    await screen.findByRole('button', { name: '정책 확정' });
    fireEvent.click(screen.getByRole('button', { name: '정책 확정' }));
    expect(await screen.findByText('정책 확정 전 승인 알림 1건')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /결제한 적이 있어요/ }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ applicantStatus: 'applicant', cardLast4: '4321', nextAction: 'import', historyAction: 'keep-undecided' })));
    expect(localStorage.getItem('shinhanhae-onboarding-progress-v1')).toBeNull();
  });

  it('lets a resumed applicant skip from policy setup and clears the saved progress', () => {
    localStorage.setItem('shinhanhae-onboarding-progress-v1', JSON.stringify({ step: 'policy', policy: emptyPolicy }));
    const onComplete = vi.fn(); render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: '넘어가기' }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ applicantStatus: 'not-applicant', nextAction: 'dashboard' }));
    expect(localStorage.getItem('shinhanhae-onboarding-progress-v1')).toBeNull();
  });

  it('keeps the user on permissions when native card configuration fails', async () => {
    mocks.configure.mockRejectedValue(new Error('native configuration failed'));
    render(<OnboardingFlow onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 완료' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('카드 설정을 완료할 수 없습니다. 권한을 다시 확인해 주세요.');
    expect(screen.queryByRole('button', { name: '정책 확정' })).not.toBeInTheDocument();
  });

  it('continues safely with no pending approvals when the native queue cannot be read', async () => {
    mocks.consumePendingApprovals.mockRejectedValue(new Error('queue unavailable'));
    const onComplete = vi.fn(); render(<OnboardingFlow onComplete={onComplete} />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    fireEvent.click(screen.getByRole('button', { name: '권한 완료' }));
    fireEvent.click(await screen.findByRole('button', { name: '정책 확정' }));
    expect(await screen.findByRole('button', { name: /아직 사용 전이에요/ })).toBeInTheDocument();
    expect(screen.queryByText(/정책 확정 전 승인 알림/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /아직 사용 전이에요/ }));
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ nextAction: 'dashboard', pendingApprovals: [] }));
  });
});
