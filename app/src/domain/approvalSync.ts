import type { BudgetKey } from './budget';
import { applyCancellation, applyPayment, getAutoCancellationMatch, type Ledger } from './ledger';
import { isInPeriodScope, selectInPeriodScope, type PeriodScope } from './periodSelectors';
import type { PaymentClassification } from './sms';
import type { NativeApproval, NativeApprovalReview, NativeCancellation } from '../native/smsBridge';

export type CrossedBudgetAlert = { alerts: number[]; bucket: BudgetKey; category?: string };

export type ApprovalBatchInput = {
  ledger: Ledger;
  approvals: NativeApproval[];
  reviews: NativeApprovalReview[];
  cancellations: NativeCancellation[];
  scope: PeriodScope;
  limits: Record<BudgetKey, number>;
  categoryLimits: Record<string, number>;
  classify: (merchant: string, amount: number) => PaymentClassification;
};

export type ApprovalBatchResult = {
  /** The ledger to persist before anything is acknowledged on the native side. */
  ledger: Ledger;
  /** Approvals that were applied. Every consumed approval is still acknowledged. */
  appliedApprovals: NativeApproval[];
  /** Incomplete approvals the user still has to confirm. */
  reviews: NativeApprovalReview[];
  /** Incomplete approvals outside the period, acknowledged without a form. */
  skippedReviewIds: string[];
  autoCancelled: NativeCancellation[];
  reviewCancellations: NativeCancellation[];
  crossedAlerts: CrossedBudgetAlert[];
};

/**
 * Applies one batch read from the native queues. Imports already omit dates
 * outside the confirmed policy period; queued notifications follow the same rule
 * so a delayed old approval or a payment during the policy gap never reappears.
 */
export function applyApprovalBatch(input: ApprovalBatchInput): ApprovalBatchResult {
  const appliedApprovals = input.approvals.filter((approval) => isInPeriodScope(approval, input.scope));
  const reviews = selectInPeriodScope(input.reviews, input.scope);
  const skippedReviewIds = input.reviews.filter((review) => !reviews.includes(review)).map((review) => review.id);
  let ledger = input.ledger;
  const crossedAlerts: CrossedBudgetAlert[] = [];
  for (const approval of appliedApprovals) {
    const applied = applyPayment(ledger, approval, input.limits, input.categoryLimits, input.classify, input.scope.period);
    ledger = applied.ledger;
    if (applied.alerts.length) crossedAlerts.push({ alerts: applied.alerts, bucket: applied.entry.bucket ?? 'resident', category: applied.entry.category });
  }
  const autoCancelled: NativeCancellation[] = [];
  const reviewCancellations: NativeCancellation[] = [];
  for (const cancellation of input.cancellations) {
    const match = getAutoCancellationMatch(ledger, cancellation);
    if (match) {
      ledger = applyCancellation(ledger, match.id, cancellation.amount, cancellation.occurredAt);
      autoCancelled.push(cancellation);
    } else reviewCancellations.push(cancellation);
  }
  return { ledger, appliedApprovals, reviews, skippedReviewIds, autoCancelled, reviewCancellations, crossedAlerts };
}
