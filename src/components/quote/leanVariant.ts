// Single source of truth for the quote-funnel A/B test.
// The "lean" variant removes six informational questions; "control" is the
// full funnel. Both the client-side validator (stepValidation.ts) and the
// QuoteForm JSX gating import from here so the two can never drift.

export type QuoteVariant = "control" | "lean";

export const LEAN_HIDDEN_FIELDS: ReadonlySet<string> = new Set([
  "electricalBoardType",     // step 1 (housing)
  "electricalLineDistance",  // step 2 (parking)
  "electricalLineHoleCount", // step 2 (parking)
  "ecpProvided",             // step 3 (charger)
  "vehicleTripDistance",     // step 4 (vehicle)
  "vehicleChargingHours",    // step 4 (vehicle)
]);

const NONE_HIDDEN: ReadonlySet<string> = new Set();

export function hiddenFieldsFor(variant: QuoteVariant): ReadonlySet<string> {
  return variant === "lean" ? LEAN_HIDDEN_FIELDS : NONE_HIDDEN;
}
