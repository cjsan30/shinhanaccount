import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('support fund home', () => {
  it('shows the primary budget summary and quick actions', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '지원금 관리' })).toBeInTheDocument();
    expect(screen.getByText('406,600원')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /정주비 상세 보기/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /미정 지출 1건/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '새 결제 확인' })).toBeInTheDocument();
  });

  it('opens a budget detail in a bottom sheet', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /정주비 상세 보기/ }));
    expect(screen.getByRole('dialog', { name: '정주비 상세' })).toBeInTheDocument();
    expect(screen.getByText('숙박비')).toBeInTheDocument();
    expect(screen.getByText('식비')).toBeInTheDocument();
    expect(screen.getByText('교통비')).toBeInTheDocument();
  });

  it('closes a bottom sheet from its close button', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '설정 열기' }));
    fireEvent.click(screen.getByRole('button', { name: '설정 닫기' }));
    expect(screen.queryByRole('dialog', { name: '설정' })).not.toBeInTheDocument();
  });

  it('shows a toast after classifying a pending payment', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '새 결제 확인' }));
    fireEvent.click(screen.getByRole('button', { name: '식비로 분류' }));
    expect(screen.getByRole('status')).toHaveTextContent('정주비 · 식비로 분류했습니다.');
  });
});