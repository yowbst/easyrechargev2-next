import type { Product } from "@/lib/products";
import type { FormValues, StepRule } from "./types";
import { ECP_STEPS, ecpFirstUnanswered } from "./products/ecp/validation";
import { BATTERY_STEPS, batteryFirstUnanswered } from "./products/battery/validation";

/**
 * Each product's answer rules, without UI: the step sequence and what each
 * step requires. The funnel uses them in the browser; `/api/quote` uses them
 * to notice a request the funnel would not have let through. A new product
 * must register here — the Record makes a missing one a build error.
 */
const ANSWER_RULES: Record<
  Product,
  { steps: StepRule[]; firstUnanswered: (stepId: string, data: FormValues) => string | null }
> = {
  ecp: { steps: ECP_STEPS, firstUnanswered: ecpFirstUnanswered },
  battery: { steps: BATTERY_STEPS, firstUnanswered: batteryFirstUnanswered },
};

/**
 * The first gap in a request's answers, walking the steps the visitor would
 * have seen; null when complete. `field: null` means the answers end on a
 * step that exits the funnel (a battery tenant), so no request should exist.
 *
 * Questions an editor hides in the Directus page config (`hiddenFields`) are
 * not known here and would be reported as missing; none are hidden today.
 */
export function firstMissingAnswer(
  product: Product,
  data: FormValues,
): { step: string; field: string | null } | null {
  const rules = ANSWER_RULES[product];
  for (const step of rules.steps) {
    if (step.skip?.(data)) continue;
    const field = rules.firstUnanswered(step.id, data);
    if (field) return { step: step.id, field };
    if (step.exit?.(data)) return { step: step.id, field: null };
  }
  return null;
}
