import type { LedgerEntry } from './ledger';
import { getPolicyPeriodKey } from './budget';

/** A withdrawal notice from the registered top-up account, as queued by Android. */
export type AccountWithdrawal = { id: string; accountLast4: string; occurredAt: string; amount: number; counterparty: string; notificationPostedAt?: number };

// Decision 2026-11-26: the main pay services. A counterparty containing one of the
// patterns is taken as a top-up of that pay; every other withdrawal is ignored.
const PAY_SERVICES: Array<{ name: string; patterns: string[] }> = [
  { name: '카카오페이', patterns: ['카카오페이', 'kakaopay'] },
  { name: '네이버페이', patterns: ['네이버페이', 'naverpay', '네이버파이낸셜'] },
  { name: '토스', patterns: ['토스', 'toss'] },
  { name: '페이코', patterns: ['페이코', 'payco'] },
  { name: '쿠팡페이', patterns: ['쿠팡페이', 'coupangpay'] },
  { name: '스마일페이', patterns: ['스마일페이', 'smilepay'] },
  { name: 'SSG페이', patterns: ['ssg페이', 'ssgpay'] },
];

/** "카카오페이 충전" for a pay top-up counterparty, otherwise null. */
export function payTopUpMerchant(counterparty: string): string | null {
  const compact = counterparty.toLowerCase().replace(/\s+/g, '');
  const service = PAY_SERVICES.find(({ patterns }) => patterns.some((pattern) => compact.includes(pattern)));
  return service ? `${service.name} 충전` : null;
}

/**
 * Pay top-ups become undecided payments: the user decides whether the topped-up money
 * was spent on the subsidy (decision 2026-11-26). They are never deducted automatically.
 * The bank origin lets a later bank statement import recognise the same withdrawal.
 */
export function topUpEntries(withdrawals: AccountWithdrawal[]): LedgerEntry[] {
  return withdrawals.flatMap((withdrawal) => {
    const merchant = payTopUpMerchant(withdrawal.counterparty);
    if (!merchant || !(withdrawal.amount > 0) || Number.isNaN(Date.parse(withdrawal.occurredAt))) return [];
    const id = `topup-${withdrawal.id}`;
    return [{
      id,
      cardLast4: withdrawal.accountLast4,
      occurredAt: withdrawal.occurredAt,
      amount: withdrawal.amount,
      merchant,
      notificationPostedAt: withdrawal.notificationPostedAt,
      source: 'notification' as const,
      status: 'undecided' as const,
      periodKey: getPolicyPeriodKey(new Date(withdrawal.occurredAt)),
      bankSummary: withdrawal.counterparty,
      importOrigins: [{ id, kind: 'bank' as const, identifierLast4: withdrawal.accountLast4, merchant: withdrawal.counterparty, occurredAt: withdrawal.occurredAt, amount: withdrawal.amount, summary: withdrawal.counterparty }],
    }];
  });
}
