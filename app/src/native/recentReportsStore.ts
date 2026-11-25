import { isRecentReport, type RecentReport } from '../domain/recentReports';
import { LOCAL_STORAGE_KEYS } from '../domain/storageKeys';

const KEY = LOCAL_STORAGE_KEYS.recentReports.key;

/** File locations, names, sizes and save times only, so plain storage is enough. */
export function loadRecentReports(): RecentReport[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isRecentReport) : [];
  } catch { return []; }
}

/** Browser builds hand out blob: URLs that die with the page, so only device file locations are kept. */
export function saveRecentReports(reports: RecentReport[]) {
  const lasting = reports.filter((report) => !report.uri.startsWith('blob:'));
  try {
    if (lasting.length) window.localStorage.setItem(KEY, JSON.stringify(lasting));
    else window.localStorage.removeItem(KEY);
  } catch { /* the list is a convenience; the files stay in Downloads either way */ }
}
