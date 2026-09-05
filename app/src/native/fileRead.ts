/**
 * Android WebView가 File.arrayBuffer()를 제공하지 않는 경우에도 선택한 파일을 읽는다.
 * 일반 브라우저와 최신 WebView에서는 즉시 arrayBuffer() 경로를 사용한다.
 */
export async function readSelectedFile(file: Blob): Promise<ArrayBuffer> {
  const reader = file as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
  if (typeof reader.arrayBuffer === 'function') return reader.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const fallback = new FileReader();
    fallback.onerror = () => reject(fallback.error ?? new Error('선택한 파일을 읽지 못했습니다.'));
    fallback.onload = () => resolve(fallback.result as ArrayBuffer);
    fallback.readAsArrayBuffer(file);
  });
}
