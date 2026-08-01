import { BUDGET_LIMITS, calculateBudgetSummary, getCrossedAlertThresholds, getPolicyPeriodKey, type BudgetKey, type BudgetSummary } from './budget';
import { classifyPayment, type PaymentClassification } from './sms';
import type { NativeApproval } from '../native/smsBridge';
import { isImportable, type ImportedCardTransaction } from './shinhanImport';

export type LedgerStatus = 'classified' | 'excluded' | 'undecided' | 'cancelled';
export type LedgerSource = 'demo' | 'sms' | 'excel' | 'manual';
export type LedgerEntry = NativeApproval & { id: string; status: LedgerStatus; bucket?: BudgetKey; category?: string; periodKey?: string; approvalNumber?: string; source?: LedgerSource; cancelledAt?: string };
export type Ledger = { entries: LedgerEntry[]; alertThresholds: [number, number] };
export type ApplyPaymentResult = { ledger: Ledger; entry: LedgerEntry; alerts: number[] };
export type ManualClassification = { bucket: BudgetKey; category: string };
export type ImportResult = { ledger: Ledger; imported: number; duplicates: number; excluded: number; undecided: number; skipped: number; replacedDemo: boolean };

const initialEntries: LedgerEntry[] = [
  { id: 'seed-lodging', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 38900, merchant: '기존 숙박비', status: 'classified', bucket: 'resident', category: 'lodging' },
  { id: 'seed-food', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 88000, merchant: '기존 식비', status: 'classified', bucket: 'resident', category: 'food' },
  { id: 'seed-transport', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 88800, merchant: '기존 교통비', status: 'classified', bucket: 'resident', category: 'transport' },
  { id: 'seed-cafe', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 77700, merchant: '기존 일반카페', status: 'classified', bucket: 'studySpace', category: 'generalCafe' },
];

export const LEDGER_STORAGE_KEY = 'shinhanhae-ledger-v1';
export function createInitialLedger(): Ledger { return { entries: initialEntries.map((entry) => ({ ...entry, source: 'demo' })), alertThresholds: [50, 80] }; }
export function createEmptyLedger(): Ledger { return { entries: [], alertThresholds: [50, 80] }; }
export function getEntryPeriodKey(entry: Pick<LedgerEntry, 'occurredAt' | 'periodKey'>) { return entry.periodKey ?? getPolicyPeriodKey(new Date(entry.occurredAt)); }
export function getSpent(ledger: Ledger, bucket: BudgetKey, periodKey?: string) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && (!periodKey || getEntryPeriodKey(entry) === periodKey)).reduce((sum, entry) => sum + entry.amount, 0); }
export function getSummary(ledger: Ledger, bucket: BudgetKey, limit: number = BUDGET_LIMITS[bucket], periodKey?: string): BudgetSummary { return calculateBudgetSummary(limit, getSpent(ledger, bucket, periodKey)); }
export function getCategorySpent(ledger: Ledger, bucket: BudgetKey, category: string, periodKey?: string) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && entry.category === category && (!periodKey || getEntryPeriodKey(entry) === periodKey)).reduce((sum, entry) => sum + entry.amount, 0); }

function toEntry(payment: NativeApproval, classification: PaymentClassification): LedgerEntry {
  const id = `${payment.occurredAt}-${payment.merchant}-${payment.amount}`;
  const periodKey = getPolicyPeriodKey(new Date(payment.occurredAt));
  if (classification.status === 'classified') return { ...payment, id, periodKey, status: 'classified', bucket: classification.bucket, category: classification.category };
  return { ...payment, id, periodKey, status: classification.status };
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
export function applyPayment(ledger: Ledger, payment: NativeApproval, limits: Record<BudgetKey, number> = BUDGET_LIMITS, categoryLimits: Record<string, number> = {}): ApplyPaymentResult {
  const classification = classifyPayment(payment.merchant, payment.amount);
  const entry = toEntry(payment, classification);
  if (ledger.entries.some((existing) => existing.id === entry.id)) return { ledger, entry, alerts: [] };
  const previousSpent = classification.status === 'classified' ? getCategorySpent(ledger, classification.bucket, classification.category, entry.periodKey) : 0;
  const nextLedger = { ...ledger, entries: [...ledger.entries, entry] };
  const currentSpent = classification.status === 'classified' ? getCategorySpent(nextLedger, classification.bucket, classification.category, entry.periodKey) : previousSpent;
  const alerts = classification.status === 'classified' ? getCrossedAlertThresholds(previousSpent, currentSpent, categoryLimits[classification.category] ?? limits[classification.bucket], ledger.alertThresholds) : [];
  return { ledger: nextLedger, entry, alerts };
}

export function saveAsUndecided(ledger: Ledger, payment: NativeApproval): ApplyPaymentResult {
  const entry: LedgerEntry = { ...payment, id: `${payment.occurredAt}-${payment.merchant}-${payment.amount}`, periodKey: getPolicyPeriodKey(new Date(payment.occurredAt)), status: 'undecided' };
  if (ledger.entries.some((existing) => existing.id === entry.id)) return { ledger, entry, alerts: [] };
  return { ledger: { ...ledger, entries: [...ledger.entries, entry] }, entry, alerts: [] };
}

export function cancelPayment(ledger: Ledger, entryId: string, cancelledAt: string): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status === 'cancelled') return ledger;
  return { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? { ...candidate, status: 'cancelled', cancelledAt } : candidate) };
}
export function reclassifyUndecided(ledger: Ledger, entryId: string, classification: ManualClassification, limits: Record<BudgetKey, number> = BUDGET_LIMITS, categoryLimits: Record<string, number> = {}): ApplyPaymentResult {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status !== 'undecided') throw new Error('Only undecided entries can be reclassified');
  const previousSpent = getCategorySpent(ledger, classification.bucket, classification.category, getEntryPeriodKey(entry));
  const nextEntry: LedgerEntry = { ...entry, status: 'classified', bucket: classification.bucket, category: classification.category, source: 'manual' };
  const nextLedger = { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? nextEntry : candidate) };
  const currentSpent = getCategorySpent(nextLedger, classification.bucket, classification.category, getEntryPeriodKey(nextEntry));
  return { ledger: nextLedger, entry: nextEntry, alerts: getCrossedAlertThresholds(previousSpent, currentSpent, categoryLimits[classification.category] ?? limits[classification.bucket], ledger.alertThresholds) };
}
export function loadLedger(storage: Pick<Storage, 'getItem'>, fallback: () => Ledger = createInitialLedger): Ledger {
  try { const raw = storage.getItem(LEDGER_STORAGE_KEY); return raw ? JSON.parse(raw) as Ledger : fallback(); } catch { return fallback(); }
}
export function saveLedger(storage: Pick<Storage, 'setItem'>, ledger: Ledger) { storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger)); }