import { describe, expect, it } from 'vitest';
import { applyApprovalBatch, type ApprovalBatchInput } from './approvalSync';
import type { Ledger, LedgerEntry } from './ledger';
import type { PaymentClassification } from './sms';

const food: PaymentClassification = { status: 'classified', bucket: 'resident', category: 'food' };
const approval = (id: string, occurredAt: string, amount = 10000, merchant = '테스트 식당') => ({ id, cardLast4: '0000', occurredAt, amount, merchant, source: 'notification' as const });
const paid = (id: string, patch: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, cardLast4: '0000', occurredAt: '2026-09-18T12:00:00+09:00', amount: 8000, merchant: '테스트 카페', status: 'classified', bucket: 'studySpace', category: 'generalCafe', ...patch });
const empty: Ledger = { entries: [], alertThresholds: [50, 80] };
const input = (patch: Partial<ApprovalBatchInput> = {}): ApprovalBatchInput => ({
  ledger: empty, approvals: [], reviews: [], cancellations: [], scope: { periodKey: '2026-09' },
  limits: { resident: 500000, studySpace: 200000 }, categoryLimits: { food: 20000 }, classify: () => food, ...patch,
});

describe('approval batch', () => {
  it('applies approvals inside the period and leaves the rest out of the ledger', () => {
    const result = applyApprovalBatch(input({ approvals: [approval('in', '2026-09-20T12:00:00+09:00'), approval('gap', '2026-10-12T12:00:00+09:00'), approval('old', '2026-08-20T12:00:00+09:00')] }));
    expect(result.appliedApprovals.map((item) => item.id)).toEqual(['in']);
    expect(result.ledger.entries.map((entry) => entry.id)).toEqual(['in']);
    expect(result.ledger.entries[0]).toMatchObject({ status: 'classified', bucket: 'resident', category: 'food' });
  });

  it('reports each threshold crossed by the batch with its bucket and category', () => {
    // 20,000원 식비 한도: 11,000원 → 55% (50% 통과), +6,000원 → 85% (80% 통과)
    const result = applyApprovalBatch(input({ approvals: [approval('a', '2026-09-20T12:00:00+09:00', 11000), approval('b', '2026-09-21T12:00:00+09:00', 6000)] }));
    expect(result.crossedAlerts).toEqual([{ alerts: [50], bucket: 'resident', category: 'food' }, { alerts: [80], bucket: 'resident', category: 'food' }]);
  });

  it('keeps undated and in-period reviews and skips the ones outside the period', () => {
    const reviews = [
      { id: 'undated', cardLast4: '0000' },
      { id: 'inside', cardLast4: '0000', occurredAt: '2026-09-20T12:00:00+09:00' },
      { id: 'gap', cardLast4: '0000', occurredAt: '2026-10-12T12:00:00+09:00' },
    ];
    const result = applyApprovalBatch(input({ reviews }));
    expect(result.reviews.map((review) => review.id)).toEqual(['undated', 'inside']);
    expect(result.skippedReviewIds).toEqual(['gap']);
  });

  it('auto-applies only an unambiguous full cancellation and leaves the rest for review', () => {
    const ledger: Ledger = { ...empty, entries: [paid('unique'), paid('twin-1', { merchant: '쌍둥이 가게', amount: 5000 }), paid('twin-2', { merchant: '쌍둥이 가게', amount: 5000 })] };
    const result = applyApprovalBatch(input({ ledger, cancellations: [
      approval('cancel-unique', '2026-09-19T12:00:00+09:00', 8000, '테스트 카페'),
      approval('cancel-twin', '2026-09-19T12:00:00+09:00', 5000, '쌍둥이 가게'),
    ] }));
    expect(result.autoCancelled.map((item) => item.id)).toEqual(['cancel-unique']);
    expect(result.reviewCancellations.map((item) => item.id)).toEqual(['cancel-twin']);
    expect(result.ledger.entries.find((entry) => entry.id === 'unique')?.status).toBe('cancelled');
    expect(result.ledger.entries.filter((entry) => entry.id.startsWith('twin')).map((entry) => entry.status)).toEqual(['classified', 'classified']);
  });

  it('does not mutate the input ledger', () => {
    const ledger: Ledger = { ...empty, entries: [paid('unique')] };
    applyApprovalBatch(input({ ledger, approvals: [approval('in', '2026-09-20T12:00:00+09:00')], cancellations: [approval('c', '2026-09-19T12:00:00+09:00', 8000, '테스트 카페')] }));
    expect(ledger.entries.map((entry) => [entry.id, entry.status])).toEqual([['unique', 'classified']]);
  });
});
