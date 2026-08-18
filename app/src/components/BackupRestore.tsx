import { useState } from 'react';
import { decryptBackup, encryptBackup, validateBackupPassphrase, type BackupPayload } from '../domain/backup';
import type { Ledger } from '../domain/ledger';
import type { PolicyBook } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';
import { saveFile } from '../native/fileExport';

type Props = { ledger: Ledger; policyBook: PolicyBook; merchantRules: MerchantRule[]; onRestore: (payload: BackupPayload) => void; notify: (message: string) => void };

export function BackupRestore({ ledger, policyBook, merchantRules, onRestore, notify }: Props) {
  const [exportPassword, setExportPassword] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const download = async () => {
    const reason = validateBackupPassphrase(exportPassword);
    if (reason) return notify(reason);
    try {
      const blob = await encryptBackup({ format: 'shinhanhae-backup', version: 1, exportedAt: new Date().toISOString(), ledger, policyBook, merchantRules }, exportPassword);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await saveFile('shinhanhae_backup.shb', bytes, 'application/octet-stream');
      setExportPassword('');
      notify(`${result.fileName}을 ${result.relativePath}에 저장했습니다.`);
    } catch { notify('백업 파일을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'); }
  };
  const restore = async () => {
    if (!file) return notify('복원할 백업 파일을 선택해 주세요.');
    if (!window.confirm('현재 정책과 결제 내역을 백업 파일 내용으로 교체합니다. 계속할까요?')) return;
    try { onRestore(await decryptBackup(file, restorePassword)); setFile(null); setRestorePassword(''); notify('백업을 복원했습니다.'); }
    catch (error) { notify(error instanceof Error ? error.message : '백업을 복원하지 못했습니다.'); }
  };
  return <section className="backup-card"><h3>백업 · 복원</h3><p>기기를 바꾸거나 초기화하기 전에 암호화된 백업 파일을 보관하세요. 복원하면 현재 정책과 결제 내역을 백업 시점으로 교체합니다.</p><label>백업 비밀번호<input aria-label="백업 비밀번호" type="password" value={exportPassword} onChange={(event) => setExportPassword(event.target.value)} placeholder="8자 이상" /></label><button className="sheet-action" onClick={() => void download()}>암호화 백업 저장</button><label className="file-picker">백업 파일 선택<input aria-label="백업 파일" type="file" accept=".shb,application/octet-stream,application/json" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>{file && <p className="backup-file">선택됨: {file.name}</p>}<label>복원 비밀번호<input aria-label="복원 비밀번호" type="password" value={restorePassword} onChange={(event) => setRestorePassword(event.target.value)} /></label><button className="sheet-action secondary-action" disabled={!file || !restorePassword} onClick={() => void restore()}>백업으로 복원하기</button></section>;
}
