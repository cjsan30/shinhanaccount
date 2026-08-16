import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

export function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value);
}

export async function saveAndShareFile(fileName: string, bytes: Uint8Array, mimeType: string) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url; link.download = fileName; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { location: 'download' as const };
  }
  const file = await Filesystem.writeFile({ path: `신청해 계산기/${fileName}`, data: bytesToBase64(bytes), directory: Directory.Documents, recursive: true });
  return { location: 'documents' as const, uri: file.uri };
}
