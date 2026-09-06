export const INVOICE_STATUSES = ["issued", "sent", "disputed", "paid", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_EVENT_TYPES = [
  "issued", "sent", "comment", "revision_requested", "revised", "paid", "cancelled",
] as const;
export type InvoiceEventType = (typeof INVOICE_EVENT_TYPES)[number];

export type InvoiceEventActor = "yoan" | "partner" | "system";

export interface InvoiceEvent {
  at: string;
  actor: InvoiceEventActor;
  type: InvoiceEventType;
  note?: string;
}

export interface InvoiceDocVersion {
  version: number;
  doc_url: string;
  doc_file_id: string;
  generated_at: string;
}

export interface PartySnapshot {
  name: string;
  contact_name?: string | null;
  street: string;
  postal_code: string;
  locality: string;
  country: string;
  email?: string | null;
  uid?: string | null;
}

export interface InvoicePeriod {
  month: string;        // "2026-07"
  start: string;        // "2026-07-01"
  end: string;          // "2026-07-31"
  issuableFrom: string; // "2026-08-16"
}

export interface ScopeLine {
  dispatchId: string | null;
  label: string;
  dispatchedAt: string;
  canton: string | null;
  postalCode: string | null;
  locality: string | null;
  lastName: string | null;
  leadCategory: string | null;
  product: string | null;
  unitPriceChf: number;
}

export const LINE_KINDS = ["lead", "adjustment", "gift"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface ScopeResult {
  lines: ScopeLine[];
  /**
   * Dispatches delivered free because the partner was over quota. Billed at
   * zero, but frozen onto the invoice so the partner can see what they got.
   */
  gifts: ScopeLine[];
  subtotalChf: number;
  /** Dispatches in the month that are not yet settled — blocks issuance. */
  unsettled: string[];
  excluded: { id: string; reason: string }[];
}
