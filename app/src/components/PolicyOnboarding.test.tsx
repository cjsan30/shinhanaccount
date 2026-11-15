import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyOnboarding } from './PolicyOnboarding';

const mocks = vi.hoisted(() => ({ recognize: vi.fn() }));
vi.mock('../native/policyOcr', () => ({ PolicyOcr: { pickAndRecognize: mocks.recognize } }));

const complete70 = '숙박비 300,000원\n식비 200,000원\n카페 200,000원';

describe('policy onboarding', () => {
  beforeEach(() => { mocks.recognize.mockReset(); });

  it('shows no outside-site link between support type and balance warnings', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onConfirm = vi.fn(); render(<PolicyOnboarding onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    await screen.findByText('검토 결과');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText(/선택한 유형의 총액과 세부항목 상한/)).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows an editable blank draft when OCR finds no amount', async () => {
    mocks.recognize.mockResolvedValue({ text: '' });
    render(<PolicyOnboarding onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    expect(await screen.findByText('이미지에서 금액을 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('주거비 계획 금액')).toHaveValue(0);
  });

  it('reads a plan without a custom item field and confirms a valid profile', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onConfirm = vi.fn(); render(<PolicyOnboarding onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    expect(await screen.findByText('스크린샷의 텍스트를 읽었습니다. 검토 후 확정해 주세요.')).toBeInTheDocument();
    expect(screen.queryByText('지원항목 직접 추가')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'shinhanhae-70', plans: expect.objectContaining({ housing: 300000, food: 200000, cafe: 200000 }) })));
  });

  it('blocks confirmation when the selected profile total is invalid and supports switching to 40만원형', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onDraftChange = vi.fn(); render(<PolicyOnboarding onConfirm={vi.fn()} onDraftChange={onDraftChange} />);
    fireEvent.click(screen.getByRole('button', { name: '스크린샷에서 읽기' }));
    await screen.findByText('검토 결과');
    fireEvent.click(screen.getByRole('button', { name: /월 40만 원형/ }));
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ profileId: 'shinhanhae-40' }));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(await screen.findByText(/정주비 합계를 200,000원으로 맞춰/)).toBeInTheDocument();
  });

  it('lets the user paste the plan text like a new period plan', async () => {
    const onConfirm = vi.fn(); render(<PolicyOnboarding onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText('계획표 내용'), { target: { value: complete70 } });
    fireEvent.click(screen.getByRole('button', { name: '계획표 읽기' }));
    fireEvent.click(await screen.findByRole('button', { name: '다음' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ plans: expect.objectContaining({ housing: 300000 }) })));
  });

});
