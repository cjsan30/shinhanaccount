import { BUDGET_LIMITS, calculateBudgetSummary, getCrossedAlertThresholds, type BudgetKey, type BudgetSummary } from './budget';
import { classifyPayment, type PaymentClassification } from './sms';
import type { NativeApproval } from '../native/smsBridge';
import { isImportable, type ImportedCardTransaction } from './shinhanImport';

export type LedgerStatus = 'classified' | 'excluded' | 'undecided';
export type LedgerSource = 'demo' | 'sms' | 'excel' | 'manual';
export type LedgerEntry = NativeApproval & { id: string; status: LedgerStatus; bucket?: BudgetKey; category?: string; approvalNumber?: string; source?: LedgerSource };
export type Ledger = { entries: LedgerEntry[]; alertThresholds: [number, number] };
export type ApplyPaymentResult = { ledger: Ledger; entry: LedgerEntry; alerts: number[] };
export type ImportResult = { ledger: Ledger; imported: number; duplicates: number; excluded: number; undecided: number; skipped: number; replacedDemo: boolean };

const initialEntries: LedgerEntry[] = [
  { id: 'seed-lodging', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 38900, merchant: '기존 숙박비', status: 'classified', bucket: 'resident', category: 'lodging' },
  { id: 'seed-food', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 88000, merchant: '기존 식비', status: 'classified', bucket: 'resident', category: 'food' },
  { id: 'seed-transport', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 88800, merchant: '기존 교통비', status: 'classified', bucket: 'resident', category: 'transport' },
  { id: 'seed-cafe', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 77700, merchant: '기존 일반카페', status: 'classified', bucket: 'studySpace', category: 'generalCafe' },
];

export const LEDGER_STORAGE_KEY = 'shinhanhae-ledger-v1';
export function createInitialLedger(): Ledger { return { entries: initialEntries.map((entry) => ({ ...entry, source: 'demo' })), alertThresholds: [50, 80] }; }
export function createEmptyLedger(): Ledger { return { entries: [], alertThresholds: [50, 80] }; }
export function getSpent(ledger: Ledger, bucket: BudgetKey) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket).reduce((sum, entry) => sum + entry.amount, 0); }
export function getSummary(ledger: Ledger, bucket: BudgetKey, limit = BUDGET_LIMITS[bucket]): BudgetSummary { return calculateBudgetSummary(limit, getSpent(ledger, bucket)); }

function toEntry(payment: NativeApproval, classification: PaymentClassification): LedgerEntry {
  const id = `${payment.occurredAt}-${payment.merchant}-${payment.amount}`;
  if (classification.status === 'classified') return { ...payment, id, status: 'classified', bucket: classification.bucket, category: classification.category };
  return { ...payment, id, status: classification.status };
}

function transactionToEntry(transaction: ImportedCardTransaction): LedgerEntry {
  const payment: NativeApproval = { cardLast4: '', occurredAt: transaction.occurredAt, merchant: transaction.merchant, amount: transaction.amount };
  const entry = toEntry(payment, transaction.classification);
  return { ...entry, id: `approval-${transaction.approvalNumber}`, approvalNumber: transaction.approvalNumber, source: 'excel' };
}

export function importCardTransactions(ledger: Ledger, transactions: ImportedCardTransaction[]): ImportResult {
  const importable = transactions.filter(isImportable);
  const replacesDemo = ledger.entries.length > 0 && ledger.entries.every((entry) => entry.source === 'demo');
  const baseline = replacesDemo ? [] : ledger.entries;
  let imported = 0;
  let duplicates = 0;
  let excluded = 0;
  let undecided = 0;
  const entries = [...baseline];
  for (const transaction of importable) {
    const entry = transactionToEntry(transaction);
    if (entries.some((existing) => existing.approvalNumber === entry.approvalNumber || existing.id === entry.id)) { duplicates += 1; continue; }
    entries.push(entry);
    imported += 1;
    if (entry.status === 'excluded') excluded += 1;
    if (entry.status === 'undecided') undecided += 1;
  }
  return { ledger: { ...ledger, entries }, imported, duplicates, excluded, undecided, skipped: transactions.length - importable.length, replacedDemo: replacesDemo };
}
export function applyPayment(ledger: Ledger, payment: NativeApproval): ApplyPaymentResult {
  const classification = classifyPayment(payment.merchant, payment.amount);
  const entry = toEntry(payment, classification);
  if (ledger.entries.some((existing) => existing.id === entry.id)) return { ledger, entry, alerts: [] };
  const previousSpent = classification.status === 'classified' ? getSpent(ledger, classification.bucket) : 0;
  const nextLedger = { ...ledger, entries: [...ledger.entries, entry] };
  const currentSpent = classification.status === 'classified' ? getSpent(nextLedger, classification.bucket) : previousSpent;
  const alerts = classification.status === 'classified' ? getCrossedAlertThresholds(previousSpent, currentSpent, BUDGET_LIMITS[classification.bucket], ledger.alertThresholds) : [];
  return { ledger: nextLedger, entry, alerts };
}

export function saveAsUndecided(ledger: Ledger, payment: NativeApproval): ApplyPaymentResult {
  const entry: LedgerEntry = { ...payment, id: `${payment.occurredAt}-${payment.merchant}-${payment.amount}`, status: 'undecided' };
  if (ledger.entries.some((existing) => existing.id === entry.id)) return { ledger, entry, alerts: [] };
  return { ledger: { ...ledger, entries: [...ledger.entries, entry] }, entry, alerts: [] };
}

export function loadLedger(storage: Pick<Storage, 'getItem'>, fallback: () => Ledger = createInitialLedger): Ledger {
  try { const raw = storage.getItem(LEDGER_STORAGE_KEY); return raw ? JSON.parse(raw) as Ledger : fallback(); } catch { return fallback(); }
}
export function saveLedger(storage: Pick<Storage, 'setItem'>, ledger: Ledger) { storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger)); }