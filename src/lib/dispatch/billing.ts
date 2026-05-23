import type { DispatchStage } from "./types";
import type { BillingConfig } from "./queries";

/** Days the partner has in the given stage before billing locks. */
export function windowDaysFor(
  stage: DispatchStage,
  billing: BillingConfig,
  partnerOverrides?: Record<string, number> | null,
): number {
  const override = partnerOverrides?.[stage];
  if (typeof override === "number") return override;
  return billing.stage_windows_days[stage] ?? 0;
}

/** True if the disqualification window for `stage` has elapsed since `enteredAt`. */
export function isWindowExpired(
  stage: DispatchStage,
  enteredAt: string | Date,
  billing: BillingConfig,
  partnerOverrides?: Record<string, number> | null,
  now: Date = new Date(),
): boolean {
  const days = windowDaysFor(stage, billing, partnerOverrides);
  if (days <= 0) return true; // 0-day window locks immediately (used for quote_sent)
  const entered = enteredAt instanceof Date ? enteredAt : new Date(enteredAt);
  const elapsedDays = (now.getTime() - entered.getTime()) / 86_400_000;
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
 *   - Window expired at the previous stage → billable on transition.
 */
export function shouldLockBilling(args: {
  newStage: DispatchStage;
  previousStage: DispatchStage;
  previousStageEnteredAt: string;
  alreadyBillable: boolean;
  disqualified: boolean;
  gift: boolean;
  billing: BillingConfig;
  partnerOverrides?: Record<string, number> | null;
}): boolean {
  if (args.disqualified || args.gift) return false;
  if (args.alreadyBillable) return true;
  if (args.newStage === "quote_sent" || args.newStage === "won" || args.newStage === "lost") {
    return true;
  }
  return isWindowExpired(
    args.previousStage,
    args.previousStageEnteredAt,
    args.billing,
    args.partnerOverrides,
  );
}
