const KEY = 'shinhanhae-lost-receipt-links-v1';

/** Payment ids only (no amounts or merchants), so plain storage is enough. */
export function loadLostReceiptLinks(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

export function saveLostReceiptLinks(ids: string[]) {
  try {
    if (ids.length) window.localStorage.setItem(KEY, JSON.stringify(ids));
    else window.localStorage.removeItem(KEY);
  } catch { /* the notice is a convenience; losing it is harmless */ }
}
