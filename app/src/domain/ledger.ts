import { BUDGET_LIMITS, calculateBudgetSummary, getCrossedAlertThresholds, type BudgetKey, type BudgetSummary } from './budget';
import { classifyPayment, type PaymentClassification } from './sms';
import type { NativeApproval } from '../native/smsBridge';

export type LedgerStatus = 'classified' | 'excluded' | 'undecided';
export type LedgerEntry = NativeApproval & { id: string; status: LedgerStatus; bucket?: BudgetKey; category?: string };
export type Ledger = { entries: LedgerEntry[]; alertThresholds: [number, number] };
export type ApplyPaymentResult = { ledger: Ledger; entry: LedgerEntry; alerts: number[] };

const initialEntries: LedgerEntry[] = [
  { id: 'seed-lodging', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 38900, merchant: '기존 숙박비', status: 'classified', bucket: 'resident', category: 'lodging' },
  { id: 'seed-food', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 88000, merchant: '기존 식비', status: 'classified', bucket: 'resident', category: 'food' },
  { id: 'seed-transport', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 88800, merchant: '기존 교통비', status: 'classified', bucket: 'resident', category: 'transport' },
  { id: 'seed-cafe', cardLast4: '', occurredAt: '2026-07-01T00:00:00+09:00', amount: 77700, merchant: '기존 일반카페', status: 'classified', bucket: 'studySpace', category: 'generalCafe' },
];

export const LEDGER_STORAGE_KEY = 'shinhanhae-ledger-v1';
export function createInitialLedger(): Ledger { return { entries: initialEntries, alertThresholds: [50, 80] }; }
export function getSpent(ledger: Ledger, bucket: BudgetKey) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket).reduce((sum, entry) => sum + entry.amount, 0); }
export function getSummary(ledger: Ledger, bucket: BudgetKey): BudgetSummary { return calculateBudgetSummary(BUDGET_LIMITS[bucket], getSpent(ledger, bucket)); }

function toEntry(payment: NativeApproval, classification: PaymentClassification): LedgerEntry {
  const id = `${payment.occurredAt}-${payment.merchant}-${payment.amount}`;
  if (classification.status === 'classified') return { ...payment, id, status: 'classified', bucket: classification.bucket, category: classification.category };
  return { ...payment, id, status: classification.status };
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

export function loadLedger(storage: Pick<Storage, 'getItem'>): Ledger {
  try { const raw = storage.getItem(LEDGER_STORAGE_KEY); return raw ? JSON.parse(raw) as Ledger : createInitialLedger(); } catch { return createInitialLedger(); }
}
export function saveLedger(storage: Pick<Storage, 'setItem'>, ledger: Ledger) { storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger)); }