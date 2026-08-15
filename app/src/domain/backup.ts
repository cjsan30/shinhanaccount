import type { Ledger } from './ledger';
import type { PolicyBook } from './policy';

export type BackupPayload = {
  format: 'shinhanhae-backup';
  version: 1;
  exportedAt: string;
  ledger: Ledger;
  policyBook: PolicyBook;
};

type EncryptedBackup = {
  format: 'shinhanhae-encrypted-backup';
  version: 1;
  salt: string;
  iv: string;
  cipherText: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 210_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function validateBackupPassphrase(passphrase: string) {
  return passphrase.length >= 8 ? null : '백업 비밀번호는 8자 이상으로 설정해 주세요.';
}

export async function encryptBackup(payload: BackupPayload, passphrase: string): Promise<Blob> {
  const reason = validateBackupPassphrase(passphrase);
  if (reason) throw new Error(reason);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const cipherText = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, key, encoder.encode(JSON.stringify(payload))));
  const backup: EncryptedBackup = { format: 'shinhanhae-encrypted-backup', version: 1, salt: toBase64(salt), iv: toBase64(iv), cipherText: toBase64(cipherText) };
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

export async function decryptBackup(file: Blob, passphrase: string): Promise<BackupPayload> {
  const parsed = JSON.parse(await file.text()) as EncryptedBackup;
  if (parsed.format !== 'shinhanhae-encrypted-backup' || parsed.version !== 1) throw new Error('신청해 계산기 백업 파일이 아닙니다.');
  try {
    const key = await deriveKey(passphrase, fromBase64(parsed.salt));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parsed.iv).buffer as ArrayBuffer }, key, fromBase64(parsed.cipherText).buffer as ArrayBuffer);
    const payload = JSON.parse(decoder.decode(plain)) as BackupPayload;
    if (payload.format !== 'shinhanhae-backup' || payload.version !== 1 || !payload.ledger || !payload.policyBook) throw new Error('백업 내용이 올바르지 않습니다.');
    return payload;
  } catch (error) {
    if (error instanceof Error && error.message === '백업 내용이 올바르지 않습니다.') throw error;
    throw new Error('백업 비밀번호가 맞지 않거나 파일이 손상되었습니다.');
  }
}
