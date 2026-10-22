export type RasterImage = { bytes: Uint8Array; width: number; height: number };
export type ExportProfile = { id: 'default' | 'compact' | 'minimum'; maxEdge: number; quality: number; pdfDpi: number | null };

/** Thrown between pages when the user cancels; callers keep the selected files. */
export class ExportCancelled extends Error {}

export const A4: [number, number] = [595.28, 841.89];
export const TARGET_BYTES = Math.floor(4.7 * 1024 * 1024);
export const PROFILES: ExportProfile[] = [{ id: 'default', maxEdge: 1024, quality: .58, pdfDpi: null }, { id: 'compact', maxEdge: 920, quality: .5, pdfDpi: 150 }, { id: 'minimum', maxEdge: 800, quality: .42, pdfDpi: 120 }];

export type ReportSummary = { periodLabel: string; totalBudget: number; totalUsed: number; buckets: Array<{ key: 'resident' | 'studySpace'; label: string; budget: number; used: number; items: Array<{ category: string; label: string; budget: number; used: number }> }> };
