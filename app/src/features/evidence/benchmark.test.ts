import { describe, expect, it, vi } from 'vitest';
import { BenchmarkCancelled, compareBenchmarks, measureBenchmark, receiptFingerprint, type BenchmarkProgress } from './benchmark';
const setup = (kind: 'legacy' | 'current' = 'current') => ({
  kind, receipts: [1, 2], fingerprint: 'same-input', profiles: [{ maxEdge: 1000, quality: .5 }, { maxEdge: 800, quality: .4 }], targetBytes: 10,
  create: vi.fn(async () => ({ add: vi.fn(async () => {}), save: vi.fn(async () => new Uint8Array(3)) })),
  cancelled: () => false, progress: vi.fn(), now: (() => { let n = 0; return () => n += 100; })(),
});
describe('benchmark measurements', () => {
  it('starts at zero receipts and measures current median over three runs', async () => {
    const options = setup(); const result = await measureBenchmark(options);
    expect(options.create).toHaveBeenCalledTimes(3);
    expect(options.progress.mock.calls[0][0]).toMatchObject({ current: 0, total: 2 });
    expect(options.progress.mock.calls.at(-1)?.[0]).toMatchObject({ current: 2, total: 2 });
    expect(result).toMatchObject({ sampleCount: 3, imageCount: 2, elapsedMs: 100, outputBytes: 3 });
  });
  it('legacy runs once and does not use fallback compression', async () => {
    const options = setup('legacy'); options.targetBytes = 1;
    expect((await measureBenchmark(options)).sampleCount).toBe(1);
    expect(options.create).toHaveBeenCalledTimes(1);
  });
  it('stops after cancellation without saving a partial result', async () => {
    const options = setup(); let stop = false;
    options.cancelled = () => stop;
    options.progress = vi.fn((progress: BenchmarkProgress) => { if (progress.current === 1) stop = true; });
    await expect(measureBenchmark(options)).rejects.toBeInstanceOf(BenchmarkCancelled);
    const pdf = await options.create.mock.results[0].value;
    expect(pdf.add).toHaveBeenCalledTimes(1); expect(pdf.save).not.toHaveBeenCalled();
    expect(options.receipts).toEqual([1, 2]);
  });
  it('retries profiles only within the bounded current algorithm', async () => {
    const options = setup(); options.targetBytes = 1;
    const result = await measureBenchmark(options);
    expect(options.create).toHaveBeenCalledTimes(6); expect(result.attempts).toBe(2);
  });
  it('rejects mismatched comparisons and reports slower as slower', async () => {
    const legacy = await measureBenchmark(setup('legacy'));
    expect(compareBenchmarks(legacy, { ...legacy, fingerprint: 'other' })).toBeNull();
    expect(compareBenchmarks(legacy, { ...legacy, elapsedMs: 120 })).toContain('20% 느렸습니다');
    expect(compareBenchmarks(legacy, { ...legacy, elapsedMs: 80 })).toContain('20% 빨랐습니다');
    expect(compareBenchmarks(legacy, legacy)).toContain('비슷');
  });
  it('fingerprints file replacement and order changes', () => {
    const item = { id: '1', order: 0, stored: { id: 's', size: 1 }, file: new File(['a'], 'a.jpg', { lastModified: 1 }) };
    expect(receiptFingerprint([item])).not.toBe(receiptFingerprint([{ ...item, order: 1 }]));
    expect(receiptFingerprint([item])).not.toBe(receiptFingerprint([{ ...item, file: new File(['b'], 'b.jpg', { lastModified: 1 }) }]));
  });
});
