export class BenchmarkCancelled extends Error {}
export type BenchmarkProgress = { current: number; total: number; stage: string; attempt: number; measuring: true };
export type BenchmarkResult = { label: string; elapsedMs: number; outputBytes: number; attempts: number; imageCount: number; runCount: number; sampleCount: number; fingerprint: string };
// Both methods run the same number of times. The first run also pays one-time setup costs
// (decoder and font loading, JIT), so it is left out and the median of the rest is compared.
export const BENCHMARK_RUNS = 4;
export const BENCHMARK_WARMUP_RUNS = 1;
export function receiptFingerprint(items: Array<{ id: string; order: number; stored: { id?: string; name?: string; size: number }; file: File }>) {
  return JSON.stringify(items.map(({ id, order, stored, file }) => [id, order, stored.id, file.name, file.size]));
}
export function compareBenchmarks(legacy?: BenchmarkResult, current?: BenchmarkResult) {
  if (!legacy || !current || legacy.fingerprint !== current.fingerprint || legacy.elapsedMs <= 0) return null;
  const change = Math.round((current.elapsedMs / legacy.elapsedMs - 1) * 100);
  return change === 0 ? '이번 입력에서는 처리 시간이 비슷합니다.' : `이번 입력에서 현재 방식은 ${Math.abs(change)}% ${change < 0 ? '빨랐습니다' : '느렸습니다'}.`;
}
export async function measureBenchmark<T>(options: {
  kind: 'legacy' | 'current'; receipts: T[]; fingerprint: string;
  profiles: Array<{ maxEdge: number; quality: number }>; targetBytes: number;
  create: () => Promise<{ add: (receipt: T, profile: { maxEdge: number; quality: number }) => Promise<void>; save: () => Promise<Uint8Array> }>;
  cancelled: () => boolean; progress: (value: BenchmarkProgress) => void; now?: () => number;
}): Promise<BenchmarkResult> {
  const check = () => { if (options.cancelled()) throw new BenchmarkCancelled(); };
  const now = options.now ?? (() => performance.now());
  const runCount = BENCHMARK_RUNS;
  const profiles = options.kind === 'legacy' ? [{ maxEdge: 1800, quality: .82 }] : options.profiles;
  if (!options.receipts.length || !profiles.length) throw new Error('측정할 영수증이 없습니다.');
  const samples: number[] = []; let outputBytes = 0; let attempts = 0;
  for (let run = 0; run < runCount; run++) {
    check(); const started = now();
    for (const [attempt, profile] of profiles.entries()) {
      check(); attempts++;
      const status = (current: number) => options.progress({ current, total: options.receipts.length, stage: `${options.kind === 'legacy' ? '과거 고화질' : '현재 단계형'} 방식 · ${run + 1}/${runCount}회 측정 · ${attempt + 1}차 압축`, attempt: attempt + 1, measuring: true });
      status(0); const pdf = await options.create(); check();
      for (const [index, receipt] of options.receipts.entries()) {
        // Yield to the UI so the cancel button can interrupt between images.
        await new Promise<void>((resolve) => setTimeout(resolve, 0)); check();
        await pdf.add(receipt, profile); check(); status(index + 1);
      }
      const bytes = await pdf.save(); check(); outputBytes = bytes.byteLength;
      if (options.kind === 'legacy' || outputBytes <= options.targetBytes) break;
    }
    const elapsed = now() - started;
    if (run >= BENCHMARK_WARMUP_RUNS) samples.push(elapsed);
  }
  check(); samples.sort((a, b) => a - b);
  return { label: options.kind === 'legacy' ? '과거 고화질 방식' : '현재 단계형 방식', elapsedMs: samples[Math.floor(samples.length / 2)], outputBytes, attempts: Math.ceil(attempts / runCount), imageCount: options.receipts.length, runCount, sampleCount: samples.length, fingerprint: options.fingerprint };
}
