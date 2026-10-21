import { useEffect, useRef } from 'react';
import { SmsBridge } from '../../native/smsBridge';

/**
 * Runs `process` when approvals may be waiting in the Android queue: shortly
 * after mount, on each foreground native event, and whenever the app becomes
 * visible again (approvals queued while it was not active). Runs never overlap,
 * and a new `process` (its inputs changed) re-subscribes and checks again.
 * `isDisposed` tells a run that started before the change to stop.
 */
export function useApprovalSync(enabled: boolean, process: (isDisposed: () => boolean) => Promise<void>) {
  const running = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    const run = async () => {
      if (running.current) return;
      running.current = true;
      try { await process(() => disposed); }
      catch { /* Android approval notification bridge is optional in browser preview. */ }
      finally { running.current = false; }
    };
    const initialTimer = window.setTimeout(() => { void run(); }, 500);
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void SmsBridge.addListener('approvalReceived', () => { void run(); })
      .then((handle) => {
        if (disposed) void handle.remove();
        else listenerHandle = handle;
      })
      .catch(() => undefined);
    const runWhenVisible = () => { if (document.visibilityState === 'visible') void run(); };
    document.addEventListener('visibilitychange', runWhenVisible);
    return () => {
      disposed = true;
      window.clearTimeout(initialTimer);
      if (listenerHandle) void listenerHandle.remove();
      document.removeEventListener('visibilitychange', runWhenVisible);
    };
  }, [enabled, process]);
}
