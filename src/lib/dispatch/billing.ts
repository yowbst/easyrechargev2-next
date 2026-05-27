import type { DispatchStage } from "./types";
import type { BillingConfig } from "./queries";

/**
 * Acceptance period — counted from dispatched_at, single global threshold.
 * After this window, the partner is considered to have accepted the lead and
 * billing locks. Disqualifying past this point is refused (and the row is
 * locked on the way out).
 */
export function isAcceptanceExpired(
  dispatchedAt: string | Date,
  billing: BillingConfig,
  partnerOverrides?: Record<string, number> | null,
  now: Date = new Date(),
): boolean {
  const overrideDays = partnerOverrides?.acceptance;
  const days =
    typeof overrideDays === "number"
      ? overrideDays
      : billing.acceptance_window_days;
  if (days <= 0) return true;
  const dispatched =
    dispatchedAt instanceof Date ? dispatchedAt : new Date(dispatchedAt);
  const elapsedDays = (now.getTime() - dispatched.getTime()) / 86_400_000;
  return elapsedDays >= days;
}

/**
 * Decide whether `billable` should flip true on a stage transition.
 *
 * Rules:
 *   - Gift → never billable.
 *   - Disqualified → never billable.
 *   - Already billable → stays billable.
 *   - Reaching quote_sent / won / lost → billable.
 *   - Acceptance window from dispatched_at has elapsed → billable.
 */
export function shouldLockBilling(args: {
  newStage: DispatchStage;
  dispatchedAt: string;
  alreadyBillable: boolean;
  disqualified: boolean;
  gift: boolean;
  billing: BillingConfig;
  partnerOverrides?: Record<string, number> | null;
}): boolean {
  if (args.disqualified || args.gift) return false;
  if (args.alreadyBillable) return true;
  if (
    args.newStage === "quote_sent" ||
    args.newStage === "won" ||
    args.newStage === "lost"
  ) {
    return true;
  }
  return isAcceptanceExpired(
    args.dispatchedAt,
    args.billing,
    args.partnerOverrides,
  );
}
