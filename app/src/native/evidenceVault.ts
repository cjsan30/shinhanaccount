import { Capacitor, registerPlugin } from '@capacitor/core';
import { bytesToBase64 } from './fileExport';

type NativeVault = {
  save(options: { id: string; base64Data: string }): Promise<{ id: string; size: number }>;
  read(options: { id: string }): Promise<{ base64Data: string; size: number }>;
  remove(options: { id: string }): Promise<void>;
};

const EvidenceVault = registerPlugin<NativeVault>('EvidenceVault');

export type StoredEvidence = { id: string; fileName: string; mimeType: string; size: number; attachedAt: string };

export async function storeEvidence(file: File): Promise<StoredEvidence> {
  const stored: StoredEvidence = { id: crypto.randomUUID().replaceAll('-', ''), fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, attachedAt: new Date().toISOString() };
  if (Capacitor.isNativePlatform()) await EvidenceVault.save({ id: stored.id, base64Data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) });
  return stored;
}

export async function loadEvidence(stored: StoredEvidence): Promise<File> {
  if (!Capacitor.isNativePlatform()) throw new Error('웹 미리보기에서는 앱을 다시 열면 증빙 파일을 다시 선택해 주세요.');
  const result = await EvidenceVault.read({ id: stored.id });
  const binary = atob(result.base64Data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], stored.fileName, { type: stored.mimeType, lastModified: new Date(stored.attachedAt).getTime() });
}

export async function removeStoredEvidence(stored: StoredEvidence) {
  if (Capacitor.isNativePlatform()) await EvidenceVault.remove({ id: stored.id });
}
