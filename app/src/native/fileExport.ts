import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

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
  // Android 11+ blocks direct writes to public Documents. Write to app cache and
  // let the Android share sheet hand the file to Files, Drive, or another app.
  const file = await Filesystem.writeFile({ path: fileName, data: bytesToBase64(bytes), directory: Directory.Cache, recursive: true });
  await Share.share({ title: fileName, url: file.uri, dialogTitle: '파일 저장 또는 공유' });
  return { location: 'share' as const, uri: file.uri };
}
