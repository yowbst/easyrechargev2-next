/**
 * Asserts the invoicing schema matches what src/lib/billing expects.
 *
 * Run: npx tsx --env-file=.env.local scripts/verify-invoicing-schema.ts
 * Exit code 0 when every collection/field is present, 1 otherwise.
 */
import { directusFetch } from "@/lib/directus";

const REQUIRED: Record<string, string[]> = {
  partner_invoices: [
    "id", "number", "version", "status", "partner", "period_month",
    "period_start", "period_end", "issued_at", "due_at", "sent_at", "paid_at",
    "payment_terms_days", "currency", "subtotal_chf", "adjustment_chf",
    "total_chf", "vat_rate", "vat_chf", "issuer_snapshot", "debtor_snapshot",
    "doc_url", "doc_file_id", "doc_versions", "events", "notes", "environment",
  ],
  partner_invoice_lines: [
    "id", "invoice", "dispatch", "kind", "label", "description", "quantity",
    "unit_price_chf", "amount_chf", "sort", "dispatched_at", "canton",
    "postal_code", "locality", "last_name", "lead_category", "product",
  ],
};

async function fields(collection: string): Promise<string[]> {
  const res = await directusFetch<{ data: { field: string }[] }>(
    `/fields/${collection}`, { next: { revalidate: 0 } },
  );
  return (res?.data ?? []).map((f) => f.field);
}

async function main() {
  let failed = false;
  for (const [collection, required] of Object.entries(REQUIRED)) {
    const present = await fields(collection);
    const missing = required.filter((f) => !present.includes(f));
    console.log(`${collection}: ${missing.length === 0 ? "OK" : `MISSING ${missing.join(", ")}`}`);
    if (missing.length) failed = true;
  }
  for (const [collection, field] of [["partner_dispatches", "invoice"], ["partners", "invoice_code"]]) {
    const present = await fields(collection);
    const ok = present.includes(field);
    console.log(`${collection}.${field}: ${ok ? "OK" : "MISSING"}`);
    if (!ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
