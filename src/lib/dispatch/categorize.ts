import type { LeadCategory } from "./types";

/**
 * Derive the lead pricing category from quote form data.
 *
 * Field names match the QuoteForm in src/components/quote/QuoteForm.tsx:
 *   - housingStatus: "owner" | "co-owner" | "tenant"
 *   - solarEquipment: "exists" | "in-progress" | "none" | ""
 *
 * Co-owners are treated as owners (same purchasing decision pattern).
 * "in-progress" solar counts as having solar (system will exist by the
 * time the EV charger is installed).
 */
export function deriveLeadCategory(data: Record<string, unknown>): LeadCategory {
  const housingStatus = String(data.housingStatus ?? "").toLowerCase();
  const solarEquipment = String(data.solarEquipment ?? "").toLowerCase();

  const isOwner = housingStatus === "owner" || housingStatus === "co-owner";
  const hasSolar = solarEquipment === "exists" || solarEquipment === "in-progress";

  if (isOwner) return hasSolar ? "owner_solar" : "owner_no_solar";
  return hasSolar ? "tenant_solar" : "tenant_no_solar";
}
