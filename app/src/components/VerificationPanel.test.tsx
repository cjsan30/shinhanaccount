import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';
import { createVerificationState } from '../domain/verification';
import { VerificationPanel } from './VerificationPanel';

const saveFile = vi.hoisted(() => vi.fn());
vi.mock('../native/fileExport', () => ({ saveFile }));

const props = () => ({ storageReady: true, storageError: false, policyBook: { versions: [], mode: 'not-applicant' as const }, ledger: createEmptyLedger(), evidence: [], value: createVerificationState(), onChange: vi.fn(), notify: vi.fn() });

beforeEach(() => { vi.clearAllMocks(); saveFile.mockResolvedValue({ fileName: 'result.txt', relativePath: 'Downloads/신청해 계산기' }); });

describe('verification panel', () => {
  it('shows automatic evidence without payment details', () => {
    render(<VerificationPanel {...props()} />);
    expect(screen.getByText('암호화 저장소')).toBeInTheDocument();
    expect(screen.getByText(/암호화 저장소 열기 성공/)).toBeInTheDocument();
  });

  it('records a manual Yes decision', () => {
    const current = props(); render(<VerificationPanel {...current} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Yes · 통과' })[0]);
    expect(current.onChange).toHaveBeenCalledWith(expect.objectContaining({ decisions: expect.objectContaining({ 'onboarding-restart': expect.objectContaining({ status: 'passed' }) }) }));
  });

  it('exports a sanitized verification report', async () => {
    const current = props(); render(<VerificationPanel {...current} />);
    fireEvent.click(screen.getByRole('button', { name: '검증 결과 내보내기' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledOnce());
    expect(new TextDecoder().decode(saveFile.mock.calls[0][1])).toContain('개인정보 보호');
  });
});
