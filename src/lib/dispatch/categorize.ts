import type { LeadCategory } from "./types";

/**
 * Derive the lead pricing category from quote form data.
 *
 * Field names match the QuoteForm in src/components/quote/QuoteForm.tsx:
 *   - housingStatus: "owner" | "co-owner" | "tenant"
 *   - solarEquipment: "exists" | "in-progress" | "none" | ""
 *
 * Co-owners are a distinct category: same housing pattern as owners but
 * different install logistics (syndicate approval, shared decisions) so
 * the price typically differs. "in-progress" solar counts as having solar
 * (system will exist by the time the EV charger is installed).
 */
export function deriveLeadCategory(data: Record<string, unknown>): LeadCategory {
  const housingStatus = String(data.housingStatus ?? "").toLowerCase();
  const solarEquipment = String(data.solarEquipment ?? "").toLowerCase();

  const hasSolar = solarEquipment === "exists" || solarEquipment === "in-progress";

  if (housingStatus === "co-owner") {
    return hasSolar ? "co_owner_solar" : "co_owner_no_solar";
  }
  if (housingStatus === "owner") {
    return hasSolar ? "owner_solar" : "owner_no_solar";
  }
  return hasSolar ? "tenant_solar" : "tenant_no_solar";
}
