import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup, validateBackupPassphrase } from './backup';
import { createEmptyLedger } from './ledger';

const payload = { format: 'shinhanhae-backup' as const, version: 1 as const, exportedAt: '2026-08-16T00:00:00.000Z', ledger: createEmptyLedger(), policyBook: { versions: [] }, merchantRules: [] };

describe('encrypted backup', () => {
  it('round-trips only with its passphrase', async () => {
    const file = await encryptBackup(payload, 'backup-passphrase');
    await expect(decryptBackup(file, 'wrong-passphrase')).rejects.toThrow('비밀번호');
    await expect(decryptBackup(file, 'backup-passphrase')).resolves.toEqual(payload);
  });
  it('requires a meaningful passphrase', () => expect(validateBackupPassphrase('1234567')).toContain('8자'));
});
