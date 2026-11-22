import { formatUid } from "./normalize";
import type { CmsCompany } from "./types";

export const EXPORT_COLUMNS = [
  "legal_name", "legal_form", "street_address", "postal_code", "locality", "canton",
  "uid", "website", "phone", "email", "contact_person", "esti_permit_number",
  "esti_valid_until", "classification", "classification_confidence", "prospect_status",
  "partner", "register_url",
] as const;

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export function csvCell(v: unknown): string {
  const s = str(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One row per company; never writes anything back to Directus. */
export function toCsv(rows: CmsCompany[]): string {
  const lines = [EXPORT_COLUMNS.join(",")];
  for (const r of rows) {
    const effective = r.classification_override ?? r.classification;
    const person = [r.contact_person_name, r.contact_person_role].filter(Boolean).join(", ");
    const cells: Record<(typeof EXPORT_COLUMNS)[number], unknown> = {
      legal_name: r.display_name || r.legal_name,
      legal_form: r.legal_form_kind,
      street_address: r.street_address,
      postal_code: r.postal_code,
      locality: r.locality,
      canton: r.canton,
      uid: formatUid(r.uid),
      website: r.website,
      phone: r.phone,
      email: r.email,
      contact_person: person,
      esti_permit_number: r.esti_permit_number,
      esti_valid_until: r.esti_valid_until,
      classification: effective,
      classification_confidence: r.classification_confidence,
      prospect_status: r.prospect_status,
      partner: r.partner ? "yes" : "",
      register_url: r.register_url,
    };
    lines.push(EXPORT_COLUMNS.map((c) => csvCell(cells[c])).join(","));
  }
  return lines.join("\n") + "\n";
}
