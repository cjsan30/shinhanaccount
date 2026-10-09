import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppInformationContent, AppInformationNotice } from './AppInformation';
import { APP_INFORMATION_TITLE, INFORMATION_SOURCES } from '../domain/appInformation';
describe('app information UI', () => {
  it('shows the same full disclosure and two safe links in settings', () => {
    render(<AppInformationContent />);
    expect(screen.getByText(/제휴한 공식 앱이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/사업 신청·선발·심사·지원금 지급은 제공하지 않습니다/)).toBeInTheDocument();
    for (const source of INFORMATION_SOURCES) {
      const link = screen.getByRole('link', { name: source.label });
      expect(link).toHaveAttribute('href', source.url);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    expect(screen.getAllByRole('link')).toHaveLength(2);
  });
  it('requires confirmation, traps keyboard focus and restores body scrolling', () => {
    const onConfirm = vi.fn(); const app = render(<AppInformationNotice onConfirm={onConfirm} error={null} />);
    const dialog = screen.getByRole('dialog', { name: APP_INFORMATION_TITLE });
    const links = within(dialog).getAllByRole('link'); const confirm = within(dialog).getByRole('button', { name: '확인' });
    expect(dialog).toHaveFocus(); expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(dialog, { key: 'Tab' }); expect(links[0]).toHaveFocus();
    links[0].focus(); fireEvent.keyDown(links[0], { key: 'Tab', shiftKey: true }); expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' }); expect(links[0]).toHaveFocus();
    fireEvent.mouseDown(dialog.parentElement!); fireEvent.keyDown(dialog, { key: 'Escape' }); expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(confirm); expect(onConfirm).toHaveBeenCalledOnce();
    app.unmount(); expect(document.body.style.overflow).not.toBe('hidden');
  });
  it('explains persistence failures without dismissing the notice', () => {
    render(<AppInformationNotice onConfirm={vi.fn()} error="다시 눌러 주세요." />);
    expect(screen.getByRole('alert')).toHaveTextContent('다시 눌러 주세요.');
    expect(screen.getByRole('button', { name: '확인' })).toBeEnabled();
  });
});
