import { Capacitor, registerPlugin } from '@capacitor/core';

type FileExportPlugin = {
  save(options: { fileName: string; base64Data: string; mimeType: string }): Promise<{ uri: string; fileName: string; relativePath: string }>;
  open(options: { uri: string; mimeType: string }): Promise<void>;
};

const FileExport = registerPlugin<FileExportPlugin>('FileExport');
let latestNativeUri: string | null = null;

export function bytesToBase64(bytes: Uint8Array) {
  let value = '';
  for (let index = 0; index < bytes.length; index += 0x8000) value += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(value);
}

export function timestampedFileName(baseName: string, date = new Date()) {
  const dot = baseName.lastIndexOf('.');
  const stem = dot > 0 ? baseName.slice(0, dot) : baseName;
  const extension = dot > 0 ? baseName.slice(dot) : '';
  const timestamp = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date).replaceAll('-', '').replaceAll(':', '').replace(' ', '_');
  return `${stem}_${timestamp}${extension}`;
}

export async function saveFile(fileName: string, bytes: Uint8Array, mimeType: string) {
  const uniqueName = timestampedFileName(fileName);
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url; link.download = uniqueName; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { location: 'download' as const, fileName: uniqueName, relativePath: 'Downloads' };
  }
  const result = await FileExport.save({ fileName: uniqueName, base64Data: bytesToBase64(bytes), mimeType });
  latestNativeUri = result.uri;
  return { location: 'downloads' as const, ...result };
}

export async function openSavedFile(uri: string, mimeType: string) {
  if (!Capacitor.isNativePlatform()) {
    window.open(uri, '_blank', 'noopener,noreferrer');
    return;
  }
  await FileExport.open({ uri, mimeType });
}

/** Opens the last file saved during this app session; browser builds use its Blob URL fallback. */
export function openLatestSavedFile(browserFallbackUrl: string, mimeType: string) {
  return openSavedFile(Capacitor.isNativePlatform() && latestNativeUri ? latestNativeUri : browserFallbackUrl, mimeType);
}
