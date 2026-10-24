import { calculateBudgetSummary, getCrossedAlertThresholds, getPolicyPeriodKey, isDateInPolicyPeriod, type BudgetKey, type BudgetSummary, type PolicyPeriod } from './budget';
import type { PaymentClassification } from './sms';
import type { NativeApproval } from '../native/smsBridge';
import { isImportable, type ImportedCardTransaction } from './shinhanImport';
import type { ImportedBankTransaction } from './shinhanBankImport';
import type { StoredEvidence } from '../native/evidenceVault';
import { reconcileImportedEntries, transactionOrigins, type TransactionOrigin } from './importReconciliation';

export type LedgerStatus = 'classified' | 'excluded' | 'undecided' | 'cancelled';
// Keep original transaction amounts separate from subsidy amounts.
export type LedgerSource = 'demo' | 'sms' | 'notification' | 'excel' | 'cardPdf' | 'bankCsv' | 'manual';
export type LedgerEntry = NativeApproval & { id: string; status: LedgerStatus; bucket?: BudgetKey; category?: string; periodKey?: string; approvalNumber?: string; source?: LedgerSource; cancelledAt?: string; cancelledAmount?: number; supportAmount?: number; supportAmountReviewRequired?: boolean; previousSupportAmount?: number; previousClassification?: ManualClassification; memo?: string; evidence?: StoredEvidence[]; importOrigins?: TransactionOrigin[]; bankSummary?: string; duplicateCandidateIds?: string[] };
export type Ledger = { entries: LedgerEntry[]; alertThresholds: [number, number] };
export type ApplyPaymentResult = { ledger: Ledger; entry: LedgerEntry; alerts: number[] };
export type ManualClassification = { bucket: BudgetKey; category: string };
export type ImportResult = { ledger: Ledger; imported: number; duplicates: number; excluded: number; undecided: number; skipped: number; replacedDemo: boolean; mergedUndecided?: number; mergedConfirmed?: number; reviewNeeded?: number };

const initialEntries: LedgerEntry[] = [
  { id: 'seed-lodging', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 38900, merchant: '기존 숙박비', status: 'classified', bucket: 'resident', category: 'lodging' },
  { id: 'seed-food', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 88000, merchant: '기존 식비', status: 'classified', bucket: 'resident', category: 'food' },
  { id: 'seed-transport', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 88800, merchant: '기존 교통비', status: 'classified', bucket: 'resident', category: 'transport' },
  { id: 'seed-cafe', cardLast4: '', occurredAt: '2026-07-20T00:00:00+09:00', amount: 77700, merchant: '기존 일반카페', status: 'classified', bucket: 'studySpace', category: 'generalCafe' },
];

export const LEDGER_STORAGE_KEY = 'shinhanhae-ledger-v1';
export function createInitialLedger(): Ledger { return { entries: initialEntries.map((entry) => ({ ...entry, source: 'demo' })), alertThresholds: [50, 80] }; }
export function createEmptyLedger(): Ledger { return { entries: [], alertThresholds: [50, 80] }; }
export function getEntryPeriodKey(entry: Pick<LedgerEntry, 'occurredAt' | 'periodKey'>, period?: PolicyPeriod) { return getPolicyPeriodKey(new Date(entry.occurredAt), period); }
export function isEntryInPolicyPeriod(entry: Pick<LedgerEntry, 'occurredAt' | 'periodKey'>, periodKey: string, period?: PolicyPeriod) { return isDateInPolicyPeriod(new Date(entry.occurredAt), periodKey, period); }
export function getRemainingPaymentAmount(entry: Pick<LedgerEntry, 'amount' | 'cancelledAmount'>) { return Math.max(0, entry.amount - (entry.cancelledAmount ?? 0)); }
export function getSupportAmount(entry: Pick<LedgerEntry, 'amount' | 'cancelledAmount' | 'supportAmount' | 'status'>) {
  if (entry.status === 'cancelled') return 0;
  const remaining = getRemainingPaymentAmount(entry);
  return entry.supportAmount === undefined ? remaining : Math.min(remaining, Math.max(0, Number.isSafeInteger(entry.supportAmount) ? entry.supportAmount : 0));
}
export function setSupportAmount(ledger: Ledger, entryId: string, amount: number): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status !== 'undecided' || entry.duplicateCandidateIds?.length) throw new Error('분류 필요 결제에서만 지원금 반영 금액을 변경할 수 있습니다.');
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > getRemainingPaymentAmount(entry)) throw new Error('지원금 반영 금액은 남은 결제 금액 이하의 양의 정수로 입력해 주세요.');
  return { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? { ...candidate, supportAmount: amount } : candidate) };
}
export function getSpent(ledger: Ledger, bucket: BudgetKey, periodKey?: string, period?: PolicyPeriod) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && (!periodKey || isEntryInPolicyPeriod(entry, periodKey, period))).reduce((sum, entry) => sum + getSupportAmount(entry), 0); }
export function getSummary(ledger: Ledger, bucket: BudgetKey, limit: number, periodKey?: string, period?: PolicyPeriod): BudgetSummary { return calculateBudgetSummary(limit, getSpent(ledger, bucket, periodKey, period)); }
export function getCategorySpent(ledger: Ledger, bucket: BudgetKey, category: string, periodKey?: string, period?: PolicyPeriod) { return ledger.entries.filter((entry) => entry.status === 'classified' && entry.bucket === bucket && entry.category === category && (!periodKey || isEntryInPolicyPeriod(entry, periodKey, period))).reduce((sum, entry) => sum + getSupportAmount(entry), 0); }

function toEntry(payment: NativeApproval, classification: PaymentClassification): LedgerEntry {
  const id = payment.id ?? `${payment.occurredAt}-${payment.merchant}-${payment.amount}`;
  const periodKey = getPolicyPeriodKey(new Date(payment.occurredAt));
  if (classification.status === 'classified') return { ...payment, id, periodKey, status: 'classified', bucket: classification.bucket, category: classification.category };
  return { ...payment, id, periodKey, status: classification.status };
}

function isSameTransaction(left: Pick<LedgerEntry, 'occurredAt' | 'merchant' | 'amount'>, right: Pick<LedgerEntry, 'occurredAt' | 'merchant' | 'amount'>) {
  return left.occurredAt === right.occurredAt && left.amount === right.amount && normalizedMerchant(left.merchant) === normalizedMerchant(right.merchant);
}

function transactionToEntry(transaction: ImportedCardTransaction, cardLast4: string, classify?: (merchant: string, amount: number) => PaymentClassification): LedgerEntry {
  const payment: NativeApproval = { cardLast4, occurredAt: transaction.occurredAt, merchant: transaction.merchant, amount: transaction.amount };
  // Without the user's rules an imported payment waits as 분류 필요 for the user to classify.
  const entry = toEntry(payment, classify ? classify(transaction.merchant, transaction.amount) : { status: 'undecided' });
  return { ...entry, id: `approval-${cardLast4}-${transaction.approvalNumber}`, approvalNumber: transaction.approvalNumber, source: 'excel' };
}

/** `classify` applies the user's merchant rules; bank withdrawals stay undecided candidates (see importBankTransactions). */
export function importCardTransactions(ledger: Ledger, transactions: ImportedCardTransaction[], cardLast4 = '', periodKey?: string, period?: PolicyPeriod, classify?: (merchant: string, amount: number) => PaymentClassification): ImportResult {
  const importable = transactions.filter(isImportable).filter((transaction) => !periodKey || isDateInPolicyPeriod(new Date(transaction.occurredAt), periodKey, period));
  if (!importable.length) return { ledger, imported: 0, duplicates: 0, excluded: 0, undecided: 0, skipped: transactions.length, replacedDemo: false };
  const replacesDemo = ledger.entries.length > 0 && ledger.entries.every((entry) => entry.source === 'demo');
  const baseline = replacesDemo ? [] : ledger.entries;
  const result = reconcileImportedEntries(baseline, importable.map((transaction) => transactionToEntry(transaction, cardLast4, classify)));
  const added = result.entries.filter((entry) => !baseline.some((existing) => existing.id === entry.id));
  return { ...result, ledger: { ...ledger, entries: result.entries }, excluded: added.filter((entry) => entry.status === 'excluded').length, undecided: added.filter((entry) => entry.status === 'undecided').length, skipped: transactions.length - importable.length, replacedDemo: replacesDemo };
}
export function importBankTransactions(ledger: Ledger, transactions: ImportedBankTransaction[], accountLast4 = '', periodKey?: string, period?: PolicyPeriod): ImportResult {
  const importable = transactions.filter((transaction) => transaction.direction === 'withdrawal').filter((transaction) => !periodKey || isDateInPolicyPeriod(new Date(transaction.occurredAt), periodKey, period));
  if (!importable.length) return { ledger, imported: 0, duplicates: 0, excluded: 0, undecided: 0, skipped: transactions.length, replacedDemo: false };
  const replacesDemo = ledger.entries.length > 0 && ledger.entries.every((entry) => entry.source === 'demo');
  const baseline = replacesDemo ? [] : ledger.entries;
  const incoming = importable.map((transaction) => {
    const entry = toEntry({ cardLast4: accountLast4, occurredAt: transaction.occurredAt, merchant: transaction.merchant, amount: transaction.amount }, { status: 'undecided' });
    return { ...entry, id: `bank-${accountLast4}-${transaction.transactionId}`, source: 'bankCsv' as const, bankSummary: transaction.summary };
  });
  const result = reconcileImportedEntries(baseline, incoming);
  return { ...result, ledger: { ...ledger, entries: result.entries }, excluded: 0, undecided: result.imported, skipped: transactions.length - importable.length, replacedDemo: replacesDemo };
}
export function applyPayment(ledger: Ledger, payment: NativeApproval, limits: Record<BudgetKey, number>, categoryLimits: Record<string, number> = {}, classifier: (merchant: string, amount: number) => PaymentClassification = () => ({ status: 'undecided' }), period?: PolicyPeriod): ApplyPaymentResult {
  const quickCategories: Record<string, Extract<PaymentClassification, { status: 'classified' }>> = {
    lodging: { status: 'classified', bucket: 'resident', category: 'lodging' }, food: { status: 'classified', bucket: 'resident', category: 'food' }, education: { status: 'classified', bucket: 'resident', category: 'education' }, transport: { status: 'classified', bucket: 'resident', category: 'transport' }, studyCafe: { status: 'classified', bucket: 'studySpace', category: 'studyCafe' }, generalCafe: { status: 'classified', bucket: 'studySpace', category: 'generalCafe' }, readingRoom: { status: 'classified', bucket: 'studySpace', category: 'readingRoom' },
  };
  const quick = payment.quickCategory ? quickCategories[payment.quickCategory] : undefined;
  const classification: PaymentClassification = payment.quickCategory === 'undecided'
    ? { status: 'undecided' }
    : quick ?? classifier(payment.merchant, payment.amount);
  const entry = { ...toEntry(payment, classification), periodKey: getPolicyPeriodKey(new Date(payment.occurredAt), period) };
  // Live notification/SMS approvals carry a source event ID. Two genuine payments
  // can otherwise have the same minute, merchant, and amount, so only that stable
  // source ID is authoritative for live duplicate prevention.
  const isDuplicate = payment.id
    ? ledger.entries.some((existing) => existing.id === entry.id)
    : ledger.entries.some((existing) => existing.id === entry.id || isSameTransaction(existing, entry));
  if (isDuplicate) return { ledger, entry, alerts: [] };
  const previousSpent = classification.status === 'classified' ? getCategorySpent(ledger, classification.bucket, classification.category, entry.periodKey, period) : 0;
  const nextLedger = { ...ledger, entries: [...ledger.entries, entry] };
  const currentSpent = classification.status === 'classified' ? getCategorySpent(nextLedger, classification.bucket, classification.category, entry.periodKey, period) : previousSpent;
  const alerts = classification.status === 'classified' && isDateInPolicyPeriod(new Date(entry.occurredAt), entry.periodKey, period) ? getCrossedAlertThresholds(previousSpent, currentSpent, categoryLimits[classification.category] ?? limits[classification.bucket], ledger.alertThresholds) : [];
  return { ledger: nextLedger, entry, alerts };
}

export function saveAsUndecided(ledger: Ledger, payment: NativeApproval): ApplyPaymentResult {
  const entry: LedgerEntry = { ...payment, id: payment.id ?? `${payment.occurredAt}-${payment.merchant}-${payment.amount}`, periodKey: getPolicyPeriodKey(new Date(payment.occurredAt)), status: 'undecided' };
  if (ledger.entries.some((existing) => existing.id === entry.id)) return { ledger, entry, alerts: [] };
  return { ledger: { ...ledger, entries: [...ledger.entries, entry] }, entry, alerts: [] };
}

export type EditableLedgerEntry = Pick<LedgerEntry, 'merchant' | 'amount' | 'occurredAt' | 'bucket' | 'category' | 'memo'>;
export function updateLedgerEntry(ledger: Ledger, entryId: string, patch: EditableLedgerEntry): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status === 'cancelled') return ledger;
  const occurredAt = new Date(patch.occurredAt);
  if (!patch.merchant.trim() || !Number.isFinite(patch.amount) || patch.amount <= 0 || Number.isNaN(occurredAt.getTime())) throw new Error('Invalid ledger entry');
  return { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? {
    ...candidate,
    merchant: patch.merchant.trim(),
    amount: Math.floor(patch.amount),
    occurredAt: occurredAt.toISOString(),
    periodKey: getPolicyPeriodKey(occurredAt),
    bucket: patch.bucket,
    category: patch.category,
    memo: patch.memo?.trim() || undefined,
    status: 'classified',
    source: 'manual',
  } : candidate) };
}
export function markAsUndecided(ledger: Ledger, entryId: string): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status === 'cancelled') return ledger;
  return {
    ...ledger,
    entries: ledger.entries.map((candidate) => candidate.id === entryId
      ? { ...candidate, previousClassification: candidate.bucket && candidate.category ? { bucket: candidate.bucket, category: candidate.category } : candidate.previousClassification, supportAmount: getSupportAmount(candidate), status: 'undecided', bucket: undefined, category: undefined }
      : candidate),
  };
}
export function excludeUndecided(ledger: Ledger, entryIds: string[]): Ledger {
  const ids = new Set(entryIds);
  if (!ids.size) return ledger;
  return {
    ...ledger,
    entries: ledger.entries.map((entry) => ids.has(entry.id) && entry.status === 'undecided' && !entry.duplicateCandidateIds?.length
      ? { ...entry, status: 'excluded', bucket: undefined, category: undefined }
      : entry),
  };
}
export function removeLedgerEntry(ledger: Ledger, entryId: string): Ledger {
  return { ...ledger, entries: ledger.entries.filter((entry) => entry.id !== entryId).map((entry) => ({ ...entry, duplicateCandidateIds: entry.duplicateCandidateIds?.filter((id) => id !== entryId) })) };
}
export function cancelPayment(ledger: Ledger, entryId: string, cancelledAt: string): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status === 'cancelled') return ledger;
  return { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? { ...candidate, status: 'cancelled', cancelledAt } : candidate) };
}
export function applyCancellation(ledger: Ledger, entryId: string, cancellationAmount: number, cancelledAt: string): Ledger {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  const remaining = entry ? getRemainingPaymentAmount(entry) : 0;
  if (!entry || entry.status === 'cancelled' || !Number.isFinite(cancellationAmount) || cancellationAmount <= 0 || cancellationAmount > remaining) return ledger;
  if (cancellationAmount === remaining) return cancelPayment(ledger, entryId, cancelledAt);
  return {
    ...ledger,
    entries: ledger.entries.map((candidate) => candidate.id === entryId
      ? { ...candidate, cancelledAmount: (candidate.cancelledAmount ?? 0) + cancellationAmount, cancelledAt, supportAmountReviewRequired: true, previousSupportAmount: candidate.previousSupportAmount ?? getSupportAmount(candidate) }
      : candidate),
  };
}
export function reclassifyUndecided(ledger: Ledger, entryId: string, classification: ManualClassification, limits: Record<BudgetKey, number>, categoryLimits: Record<string, number> = {}, period?: PolicyPeriod): ApplyPaymentResult {
  const entry = ledger.entries.find((candidate) => candidate.id === entryId);
  if (!entry || entry.status !== 'undecided' || entry.duplicateCandidateIds?.length) throw new Error('Only resolved undecided entries can be reclassified');
  const previousSpent = getCategorySpent(ledger, classification.bucket, classification.category, getEntryPeriodKey(entry, period), period);
  if (getSupportAmount(entry) <= 0) throw new Error('지원금 반영 금액을 확인해 주세요.');
  const nextEntry: LedgerEntry = { ...entry, supportAmount: getSupportAmount(entry), supportAmountReviewRequired: false, previousSupportAmount: undefined, previousClassification: undefined, importOrigins: transactionOrigins(entry), status: 'classified', bucket: classification.bucket, category: classification.category, source: 'manual' };
  const nextLedger = { ...ledger, entries: ledger.entries.map((candidate) => candidate.id === entryId ? nextEntry : candidate) };
  const currentSpent = getCategorySpent(nextLedger, classification.bucket, classification.category, getEntryPeriodKey(nextEntry, period), period);
  return { ledger: nextLedger, entry: nextEntry, alerts: getCrossedAlertThresholds(previousSpent, currentSpent, categoryLimits[classification.category] ?? limits[classification.bucket], ledger.alertThresholds) };
}
export function loadLedger(storage: Pick<Storage, 'getItem'>, fallback: () => Ledger = createInitialLedger): Ledger {
  try { const raw = storage.getItem(LEDGER_STORAGE_KEY); return raw ? JSON.parse(raw) as Ledger : fallback(); } catch { return fallback(); }
}
export function saveLedger(storage: Pick<Storage, 'setItem'>, ledger: Ledger) { storage.setItem(LEDGER_STORAGE_KEY, JSON.stringify(ledger)); }
export type CancellationNotice = NativeApproval;
export type CancellationMatch = { entry: LedgerEntry; score: number; isFullCancellation: boolean };
function normalizedMerchant(value: string) { return value.toLowerCase().replace(/[\s().,]/g, ''); }
export function findCancellationCandidates(ledger: Ledger, notice: CancellationNotice): CancellationMatch[] {
  const merchant = normalizedMerchant(notice.merchant);
  return ledger.entries
    .filter((entry) => (entry.status === 'classified' || entry.status === 'undecided') && notice.amount <= getRemainingPaymentAmount(entry) && entry.occurredAt <= notice.occurredAt)
    .map((entry) => {
      const sameMerchant = normalizedMerchant(entry.merchant) === merchant;
      const sameCard = Boolean(notice.cardLast4) && Boolean(entry.cardLast4) && entry.cardLast4 === notice.cardLast4;
      return { entry, score: 3 + (sameMerchant ? 4 : 0) + (sameCard ? 2 : 0), isFullCancellation: notice.amount === getRemainingPaymentAmount(entry) };
    })
    .filter((candidate) => candidate.score >= 7)
    .sort((a, b) => b.score - a.score || b.entry.occurredAt.localeCompare(a.entry.occurredAt));
}
export function getAutoCancellationMatch(ledger: Ledger, notice: CancellationNotice) {
  const candidates = findCancellationCandidates(ledger, notice);
  // Auto-cancellation is deliberately limited to an exact card, amount, and
  // merchant match. Multiple identical prior payments are left for the user.
  return candidates.length === 1 && candidates[0].isFullCancellation && candidates[0].score >= 9 ? candidates[0].entry : null;
}

export type SuspectedDuplicate = { entry: LedgerEntry; minutesApart: number };
export function findSuspectedDuplicates(ledger: Ledger, payment: Pick<NativeApproval, 'merchant' | 'amount' | 'occurredAt' | 'cardLast4'>, excludeId?: string, windowMinutes = 2): SuspectedDuplicate[] {
  const occurredAt = new Date(payment.occurredAt).getTime();
  if (Number.isNaN(occurredAt)) return [];
  return ledger.entries
    .filter((entry) => entry.id !== excludeId && entry.status !== 'cancelled' && entry.amount === payment.amount && normalizedMerchant(entry.merchant) === normalizedMerchant(payment.merchant))
    .filter((entry) => !payment.cardLast4 || !entry.cardLast4 || entry.cardLast4 === payment.cardLast4)
    .map((entry) => ({ entry, minutesApart: Math.abs(new Date(entry.occurredAt).getTime() - occurredAt) / 60_000 }))
    .filter((candidate) => candidate.minutesApart <= windowMinutes)
    .sort((left, right) => left.minutesApart - right.minutesApart);
}

export function getHistoryEntries(ledger: Ledger, through?: Date) {
  return ledger.entries
    .filter((entry) => (entry.status === 'classified' || entry.status === 'cancelled' || entry.status === 'excluded') && (!through || new Date(entry.occurredAt).getTime() <= through.getTime()))
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id));
}

export function getRecentEntries(ledger: Ledger, periodKey: string, limit = Number.POSITIVE_INFINITY, through?: Date, period?: PolicyPeriod) {
  return ledger.entries
    .filter((entry) => (entry.status === 'classified' || entry.status === 'cancelled') && isEntryInPolicyPeriod(entry, periodKey, period) && (!through || new Date(entry.occurredAt).getTime() <= through.getTime()))
    .slice()
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.id.localeCompare(left.id))
    .slice(0, limit);
}
