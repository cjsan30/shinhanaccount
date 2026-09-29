import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLedger } from '../domain/ledger';

const { encryptBackup, decryptBackup, saveFile } = vi.hoisted(() => ({ encryptBackup: vi.fn(), decryptBackup: vi.fn(), saveFile: vi.fn() }));
vi.mock('../domain/backup', async (importOriginal) => {
  const original = await importOriginal<typeof import('../domain/backup')>();
  return { ...original, encryptBackup, decryptBackup };
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
    vi.stubGlobal('confirm', vi.fn(() => true));
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

  it('restores a selected backup only after confirmation and clears secret input afterward', async () => {
    const restored = { format: 'shinhanhae-backup', version: 1, exportedAt: '2026-09-29T00:00:00.000Z', ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [] } as const;
    decryptBackup.mockResolvedValue(restored);
    const onRestore = vi.fn(); const notify = vi.fn(); render(<BackupRestore {...props} onRestore={onRestore} notify={notify} />);
    fireEvent.change(screen.getByLabelText('백업 파일'), { target: { files: [new File(['backup'], 'saved.shb', { type: 'application/octet-stream' })] } });
    fireEvent.change(screen.getByLabelText('복원 비밀번호'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: '백업으로 복원하기' }));
    await waitFor(() => expect(decryptBackup).toHaveBeenCalledWith(expect.any(File), 'password1'));
    expect(onRestore).toHaveBeenCalledWith(restored);
    expect(notify).toHaveBeenCalledWith('백업을 복원했습니다.');
    expect(screen.queryByText('선택됨: saved.shb')).not.toBeInTheDocument();
    expect(screen.getByLabelText('복원 비밀번호')).toHaveValue('');
  });

  it('does not decrypt when the user cancels replacement, and reports decryption errors', async () => {
    const notify = vi.fn(); render(<BackupRestore {...props} notify={notify} />);
    fireEvent.change(screen.getByLabelText('백업 파일'), { target: { files: [new File(['backup'], 'saved.shb', { type: 'application/octet-stream' })] } });
    fireEvent.change(screen.getByLabelText('복원 비밀번호'), { target: { value: 'password1' } });
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: '백업으로 복원하기' }));
    expect(decryptBackup).not.toHaveBeenCalled();
    vi.mocked(window.confirm).mockReturnValueOnce(true); decryptBackup.mockRejectedValueOnce(new Error('백업 비밀번호가 맞지 않거나 파일이 손상되었습니다.'));
    fireEvent.click(screen.getByRole('button', { name: '백업으로 복원하기' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('백업 비밀번호가 맞지 않거나 파일이 손상되었습니다.'));
  });
});
