import { isInPeriodBounds } from './periodSelectors';
import { restoreBeforeDeposit } from './policyStart';
import type { Ledger, LedgerEntry } from './ledger';
import type { PolicyBook } from './policy';
import { LOCAL_STORAGE_KEYS } from './storageKeys';

/**
 * Tools of the device verification build only (`--mode internal`): they set up the
 * states a tester cannot wait for. Nothing here is reachable from the Play build.
 */

export const VERIFY_DATE_OFFSET_KEY = LOCAL_STORAGE_KEYS.verifyDateOffset.key;
export const TEST_PAYMENT_PREFIX = 'verify-test-';
const DAY = 86_400_000;

const koreaDay = (time: number) => new Date(time + 9 * 3_600_000).toISOString().slice(0, 10);

/** Whole days to shift "today" so it reads as `targetDate` (YYYY-MM-DD, Korea time). */
export function getDateOffset(targetDate: string, realNow: number) {
  return Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${koreaDay(realNow)}T00:00:00Z`)) / DAY) * DAY;
}

/** Removes this period's plan and deposit state, putting its payments back as they were before. */
export function resetPeriodForVerification(book: PolicyBook, ledger: Ledger, periodKey: string): { book: PolicyBook; ledger: Ledger } {
  const excluded = ledger.entries.filter((entry) => entry.beforeDeposit && isInPeriodBounds(entry, { periodKey })).map((entry) => entry.id);
  return { book: { ...book, versions: book.versions.filter((version) => version.periodKey !== periodKey) }, ledger: restoreBeforeDeposit(ledger, excluded) };
}

/** Three classified 5,000원 food payments on `date` (09:00, 13:00, 18:00 Korea time). */
export function addTestPayments(ledger: Ledger, date: string): Ledger {
  const stamp = Date.now();
  const payments: LedgerEntry[] = ['09:00', '13:00', '18:00'].map((time, index) => ({
    id: `${TEST_PAYMENT_PREFIX}${stamp}-${index + 1}`,
    cardLast4: '0000',
    occurredAt: `${date}T${time}:00+09:00`,
    amount: 5000,
    merchant: `검증 결제 ${index + 1} (${time})`,
    status: 'classified',
    bucket: 'resident',
    category: 'food',
    source: 'manual',
  }));
  return { ...ledger, entries: [...ledger.entries, ...payments] };
}

export function removeTestPayments(ledger: Ledger): Ledger {
  return { ...ledger, entries: ledger.entries.filter((entry) => !entry.id.startsWith(TEST_PAYMENT_PREFIX)) };
}
