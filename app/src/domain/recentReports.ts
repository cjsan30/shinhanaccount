/** A report PDF the app saved to Downloads. Only where it is and how big it is; no report content. */
export type RecentReport = { uri: string; fileName: string; size: number; savedAt: string };

export const RECENT_REPORT_LIMIT = 5;

/** Newest first, one row per file, at most RECENT_REPORT_LIMIT rows. */
export function addRecentReport(current: RecentReport[], report: RecentReport): RecentReport[] {
  return [report, ...current.filter((item) => item.uri !== report.uri)].slice(0, RECENT_REPORT_LIMIT);
}

export function removeRecentReport(current: RecentReport[], uri: string): RecentReport[] {
  return current.filter((item) => item.uri !== uri);
}

export function isRecentReport(value: unknown): value is RecentReport {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.uri === 'string' && typeof item.fileName === 'string' && typeof item.size === 'number' && typeof item.savedAt === 'string';
}
