import { Capacitor, registerPlugin } from '@capacitor/core';
import { bytesToBase64 } from './fileExport';
import { EVIDENCE_NOT_FOUND } from '../domain/lostEvidence';

type NativeVault = {
  save(options: { id: string; base64Data: string }): Promise<{ id: string; size: number }>;
  read(options: { id: string }): Promise<{ base64Data: string; size: number }>;
  remove(options: { id: string }): Promise<void>;
};

const webFiles = new Map<string, File>();
const EvidenceVault = registerPlugin<NativeVault>('EvidenceVault');

export type StoredEvidence = { id: string; fileName: string; mimeType: string; size: number; attachedAt: string };

export async function storeEvidence(file: File): Promise<StoredEvidence> {
  const stored: StoredEvidence = { id: crypto.randomUUID().replaceAll('-', ''), fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, attachedAt: new Date().toISOString() };
  if (Capacitor.isNativePlatform()) await EvidenceVault.save({ id: stored.id, base64Data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) });
  if (!Capacitor.isNativePlatform()) webFiles.set(stored.id, file);
  return stored;
}

export async function loadEvidence(stored: StoredEvidence): Promise<File> {
  if (!Capacitor.isNativePlatform() && webFiles.has(stored.id)) return webFiles.get(stored.id)!;
  if (!Capacitor.isNativePlatform()) throw Object.assign(new Error('웹 미리보기에서는 앱을 다시 열면 증빙 파일을 다시 선택해 주세요.'), { code: EVIDENCE_NOT_FOUND });
  const result = await EvidenceVault.read({ id: stored.id });
  const binary = atob(result.base64Data);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new File([bytes], stored.fileName, { type: stored.mimeType, lastModified: new Date(stored.attachedAt).getTime() });
}

// Ids (no names or contents) of stored files whose deletion failed; retried on the next start (decision 2026-11-17).
const PENDING_REMOVAL_KEY = 'shinhanhae-evidence-pending-removal-v1';

function loadPendingRemovals(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PENDING_REMOVAL_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function savePendingRemovals(ids: string[]) {
  try {
    if (ids.length) window.localStorage.setItem(PENDING_REMOVAL_KEY, JSON.stringify(ids));
    else window.localStorage.removeItem(PENDING_REMOVAL_KEY);
  } catch { /* the next failed deletion records it again */ }
}

export async function removeStoredEvidence(stored: StoredEvidence) {
  webFiles.delete(stored.id);
  if (!Capacitor.isNativePlatform()) return;
  try {
    await EvidenceVault.remove({ id: stored.id });
  } catch (error) {
    savePendingRemovals([...new Set([...loadPendingRemovals(), stored.id])]);
    throw error;
  }
}

/**
 * Deletes again the stored files whose deletion failed before. An id still used by an
 * attachment is never deleted, only forgotten. Ids that fail again stay for the next start.
 */
export async function retryPendingEvidenceRemovals(inUse: ReadonlySet<string>) {
  const pending = loadPendingRemovals();
  if (!pending.length || !Capacitor.isNativePlatform()) return;
  const stillFailing: string[] = [];
  for (const id of pending) {
    if (inUse.has(id)) continue;
    try { await EvidenceVault.remove({ id }); } catch { stillFailing.push(id); }
  }
  savePendingRemovals(stillFailing);
}
