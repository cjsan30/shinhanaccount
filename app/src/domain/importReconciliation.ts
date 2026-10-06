import type { Ledger, LedgerEntry } from './ledger';

export type TransactionOrigin = { id: string; kind: 'card' | 'bank'; identifierLast4: string; merchant: string; occurredAt: string; amount: number; summary?: string };
const originKind = (entry: LedgerEntry) => entry.source === 'bankCsv' || entry.id.startsWith('bank-') ? 'bank' : ['excel', 'cardPdf', 'sms', 'notification'].includes(entry.source ?? '') || entry.id.startsWith('approval-') ? 'card' : undefined;
export function transactionOrigins(entry: LedgerEntry): TransactionOrigin[] {
  if (Array.isArray(entry.importOrigins) && entry.importOrigins.length) return entry.importOrigins.filter((origin) => origin && typeof origin.id === 'string' && (origin.kind === 'card' || origin.kind === 'bank') && typeof origin.identifierLast4 === 'string' && typeof origin.merchant === 'string' && typeof origin.occurredAt === 'string' && Number.isFinite(origin.amount));
  const kind = originKind(entry);
  return kind ? [{ id: entry.id, kind, identifierLast4: entry.cardLast4, merchant: entry.merchant, occurredAt: entry.occurredAt, amount: entry.amount, summary: entry.bankSummary }] : [];
}
function crossSource(left: LedgerEntry, right: LedgerEntry) {
  const kind = transactionOrigins(right)[0]?.kind;
  return kind && transactionOrigins(left).some((origin) => origin.kind !== kind) && !transactionOrigins(left).some((origin) => origin.kind === kind);
}
function nearby(left: LedgerEntry, right: LedgerEntry) {
  const leftTime = Date.parse(left.occurredAt), rightTime = Date.parse(right.occurredAt);
  const delta = Math.abs(leftTime - rightTime);
  return left.status !== 'cancelled' && right.status !== 'cancelled' && left.amount === right.amount && Number.isFinite(delta) && delta <= 60_000 && Math.floor((leftTime + 9 * 3600_000) / 86400_000) === Math.floor((rightTime + 9 * 3600_000) / 86400_000);
}
export function mergeTransactionOrigins(existing: LedgerEntry, incoming: LedgerEntry): LedgerEntry {
  const origins = [...transactionOrigins(existing), ...transactionOrigins(incoming)].filter((origin, index, list) => list.findIndex((other) => other.id === origin.id && other.kind === origin.kind) === index);
  const card = origins.find((origin) => origin.kind === 'card');
  return { ...existing, merchant: card?.merchant ?? existing.merchant, importOrigins: origins, evidence: [...(existing.evidence ?? []), ...(incoming.evidence ?? [])].filter((evidence, index, list) => list.findIndex((other) => other.id === evidence.id) === index) };
}
export function reconcileImportedEntries(baseline: LedgerEntry[], incoming: LedgerEntry[]) {
  const entries = [...baseline];
  let imported = 0, duplicates = 0, mergedUndecided = 0, mergedConfirmed = 0, reviewNeeded = 0;
  for (const raw of incoming) {
    const next = { ...raw, importOrigins: transactionOrigins(raw) };
    const normalize = (name: string) => name.toLowerCase().replace(/[\s().,]/g, '');
    const repeat = entries.find((entry) => entry.id === next.id || (next.approvalNumber && entry.approvalNumber === next.approvalNumber && entry.cardLast4 === next.cardLast4) || (!transactionOrigins(entry).length && entry.cardLast4 === next.cardLast4 && entry.occurredAt === next.occurredAt && entry.amount === next.amount && normalize(entry.merchant) === normalize(next.merchant)) || transactionOrigins(entry).some((origin) => transactionOrigins(next).some((other) => other.kind === origin.kind && other.identifierLast4 === origin.identifierLast4 && (other.id === origin.id || (other.occurredAt === origin.occurredAt && other.amount === origin.amount && normalize(other.merchant) === normalize(origin.merchant))))));
    if (repeat) { duplicates++; continue; }
    // Compare against the full batch, not only earlier rows: a one-to-many match is never auto-merged.
    const candidates = entries.filter((entry) => !entry.duplicateCandidateIds?.length && crossSource(entry, next) && nearby(entry, next));
    const candidate = candidates[0];
    const unique = candidate && incoming.filter((entry) => crossSource(candidate, entry) && nearby(candidate, entry)).length === 1;
    const bank = transactionOrigins(next).find((origin) => origin.kind === 'bank') ?? (candidate && transactionOrigins(candidate).find((origin) => origin.kind === 'bank'));
    if (candidates.length === 1 && unique && /체크카드|카드결제|카드승인/.test(bank?.summary ?? '')) {
      entries[entries.indexOf(candidate)] = mergeTransactionOrigins(candidate, next);
      if (candidate.status === 'undecided') mergedUndecided++; else mergedConfirmed++;
      continue;
    }
    if (candidates.length) {
      entries.push({ ...next, status: 'undecided', bucket: undefined, category: undefined, duplicateCandidateIds: candidates.map((entry) => entry.id) });
      reviewNeeded++;
    } else entries.push(next);
    imported++;
  }
  return { entries, imported, duplicates, mergedUndecided, mergedConfirmed, reviewNeeded };
}
export function resolveImportDuplicate(ledger: Ledger, incomingId: string, existingId: string, same: boolean): Ledger {
  const incoming = ledger.entries.find((entry) => entry.id === incomingId);
  const existing = ledger.entries.find((entry) => entry.id === existingId);
  if (!incoming || incoming.status !== 'undecided' || !existing || !incoming.duplicateCandidateIds?.includes(existingId)) return ledger;
  if (!same) return { ...ledger, entries: ledger.entries.map((entry) => entry.id === incomingId ? { ...entry, duplicateCandidateIds: entry.duplicateCandidateIds?.filter((id) => id !== existingId) } : entry) };
  const merged = mergeTransactionOrigins(existing, incoming);
  return { ...ledger, entries: ledger.entries.filter((entry) => entry.id !== incomingId).map((entry) => {
    const updated = entry.id === existingId ? merged : entry;
    return { ...updated, duplicateCandidateIds: updated.duplicateCandidateIds?.map((id) => id === incomingId ? existingId : id).filter((id, index, ids) => id !== updated.id && ids.indexOf(id) === index && (id !== existingId || crossSource(merged, updated))) };
  }) };
}
