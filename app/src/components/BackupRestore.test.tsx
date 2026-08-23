import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';

const { encryptBackup, saveFile } = vi.hoisted(() => ({ encryptBackup: vi.fn(), saveFile: vi.fn() }));
vi.mock('../domain/backup', async (importOriginal) => {
  const original = await importOriginal<typeof import('../domain/backup')>();
  return { ...original, encryptBackup };
});
vi.mock('../native/fileExport', () => ({ saveFile }));
import { BackupRestore } from './BackupRestore';

const props = {
  ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [], onRestore: vi.fn(), notify: vi.fn(),
};

describe('backup export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptBackup.mockResolvedValue(new Blob(['encrypted']));
  });

  it('reports the direct Downloads path after saving', async () => {
    saveFile.mockResolvedValue({ fileName: 'backup_20260819.shb', relativePath: 'Downloads/신청해 계산기' });
    render(<BackupRestore {...props} />);
    fireEvent.change(screen.getByLabelText('백업 비밀번호'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: '암호화 백업 저장' }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringContaining('Downloads/신청해 계산기')));
  });

  it('keeps the workflow recoverable when native saving fails', async () => {
    saveFile.mockRejectedValue(new Error('disk full'));
    render(<BackupRestore {...props} />);
    fireEvent.change(screen.getByLabelText('백업 비밀번호'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: '암호화 백업 저장' }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다')));
  });

  it('keeps the workflow recoverable when encryption fails before saving', async () => {
    encryptBackup.mockRejectedValue(new Error('crypto unavailable'));
    render(<BackupRestore {...props} />);
    fireEvent.change(screen.getByLabelText('백업 비밀번호'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: '암호화 백업 저장' }));
    await waitFor(() => expect(props.notify).toHaveBeenCalledWith(expect.stringContaining('저장하지 못했습니다')));
    expect(saveFile).not.toHaveBeenCalled();
  });
});
