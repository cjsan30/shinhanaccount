import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PolicyOnboarding } from './PolicyOnboarding';

const mocks = vi.hoisted(() => ({ recognize: vi.fn() }));
vi.mock('../native/policyOcr', () => ({ PolicyOcr: { pickAndRecognize: mocks.recognize } }));

const complete70 = '숙박비 300,000원\n식비 200,000원\n카페 200,000원';

describe('policy onboarding', () => {
  beforeEach(() => { mocks.recognize.mockReset(); });

  it('places only an external source button between support type and balance warnings', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onConfirm = vi.fn(); render(<PolicyOnboarding onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '이미지로 계획표 불러오기' }));
    await screen.findByText('읽은 계획 금액');
    const link = screen.getByRole('link', { name: '사업 기준·출처 확인' });
    expect(link).toHaveAttribute('href', 'https://shinchunghae.co.kr/');
    expect(document.querySelector('.support-profile-picker')!.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(link.compareDocumentPosition(document.querySelector('.policy-alert-targets')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText(/선택한 유형의 총액과 세부항목 상한/)).not.toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows an editable blank draft when OCR finds no amount', async () => {
    mocks.recognize.mockResolvedValue({ text: '' });
    render(<PolicyOnboarding onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '이미지로 계획표 불러오기' }));
    expect(await screen.findByText('이미지에서 금액을 읽지 못했습니다. 항목별 금액을 직접 입력해 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('온보딩 주거비 금액')).toHaveValue(0);
  });

  it('reads a plan, lets the user add a custom item, and confirms a valid profile', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onConfirm = vi.fn(); render(<PolicyOnboarding onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole('button', { name: '이미지로 계획표 불러오기' }));
    expect(await screen.findByText('OCR 결과를 확인하고 필요한 금액만 수정해 주세요.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('사용자 지원항목 이름'), { target: { value: '장비 대여' } });
    fireEvent.change(screen.getByLabelText('사용자 지원항목 금액'), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: '항목 추가' }));
    expect(screen.getByText('정주비 · 장비 대여')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '삭제' }));
    fireEvent.click(screen.getByRole('button', { name: '정책 확정' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'shinhanhae-70', plans: expect.objectContaining({ housing: 300000, food: 200000, cafe: 200000 }), customItems: [] })));
  });

  it('blocks confirmation when the selected profile total is invalid and supports switching to 40만원형', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    const onDraftChange = vi.fn(); render(<PolicyOnboarding onConfirm={vi.fn()} onDraftChange={onDraftChange} />);
    fireEvent.click(screen.getByRole('button', { name: '이미지로 계획표 불러오기' }));
    await screen.findByText('읽은 계획 금액');
    fireEvent.click(screen.getByRole('button', { name: /월 40만 원형/ }));
    expect(onDraftChange).toHaveBeenLastCalledWith(expect.objectContaining({ profileId: 'shinhanhae-40' }));
    fireEvent.click(screen.getByRole('button', { name: '정책 확정' }));
    expect(await screen.findByText(/정주비 합계를 200,000원으로 맞춰/)).toBeInTheDocument();
  });

  it('reports a user-item validation error instead of adding an incomplete item', async () => {
    mocks.recognize.mockResolvedValue({ text: complete70 });
    render(<PolicyOnboarding onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '이미지로 계획표 불러오기' }));
    await screen.findByText('읽은 계획 금액');
    fireEvent.click(screen.getByRole('button', { name: '항목 추가' }));
    expect(await screen.findByText('사용자 항목 이름과 금액을 확인해 주세요.')).toBeInTheDocument();
  });
});
