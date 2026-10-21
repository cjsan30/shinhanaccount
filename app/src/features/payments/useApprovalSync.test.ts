import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { smsBridge } = vi.hoisted(() => ({ smsBridge: { addListener: vi.fn() } }));
vi.mock('../../native/smsBridge', () => ({ SmsBridge: smsBridge }));
import { useApprovalSync } from './useApprovalSync';

let nativeListener: (() => void) | null = null;
const remove = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.useFakeTimers();
  nativeListener = null;
  remove.mockClear();
  smsBridge.addListener.mockImplementation(async (_event: string, listener: () => void) => { nativeListener = listener; return { remove }; });
});
afterEach(() => { vi.useRealTimers(); });

const setVisibility = (state: DocumentVisibilityState) => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });

describe('useApprovalSync', () => {
  it('does nothing until enabled', async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useApprovalSync(false, process));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(process).not.toHaveBeenCalled();
    expect(smsBridge.addListener).not.toHaveBeenCalled();
  });

  it('checks shortly after mount, on native events and when the app becomes visible', async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    renderHook(() => useApprovalSync(true, process));
    await act(async () => { await vi.advanceTimersByTimeAsync(499); });
    expect(process).toHaveBeenCalledTimes(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(process).toHaveBeenCalledTimes(1);
    await act(async () => { nativeListener?.(); });
    expect(process).toHaveBeenCalledTimes(2);
    setVisibility('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(process).toHaveBeenCalledTimes(2);
    setVisibility('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(process).toHaveBeenCalledTimes(3);
  });

  it('never runs two checks at once and recovers after a failure', async () => {
    let finish: () => void = () => undefined;
    const process = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }))
      .mockRejectedValueOnce(new Error('bridge unavailable'))
      .mockResolvedValue(undefined);
    renderHook(() => useApprovalSync(true, process));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    await act(async () => { nativeListener?.(); });
    expect(process).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    await act(async () => { nativeListener?.(); });
    await act(async () => { nativeListener?.(); });
    expect(process).toHaveBeenCalledTimes(3);
  });

  it('tells a running check when it was superseded and cleans up on unmount', async () => {
    let seenDisposed: () => boolean = () => false;
    const process = vi.fn(async (isDisposed: () => boolean) => { seenDisposed = isDisposed; });
    const { unmount } = renderHook(() => useApprovalSync(true, process));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(seenDisposed()).toBe(false);
    unmount();
    expect(seenDisposed()).toBe(true);
    expect(remove).toHaveBeenCalled();
  });
});
