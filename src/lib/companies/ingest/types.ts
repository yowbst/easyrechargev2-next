/** Shared types for the Zefix installer pipeline (see docs/companies-ingest.md). */

export type Classification =
  | "installer"
  | "inspector"
  | "planner"
  | "solar"
  | "other"
  | "unclassified";

export const CLASSIFICATION_LABELS = ["installer", "inspector", "planner", "solar", "other"] as const;
export type ClassificationLabel = (typeof CLASSIFICATION_LABELS)[number];

export type LegalFormKind =
  | "corporation"
  | "llc"
  | "sp"
  | "gp"
  | "cooperative"
  | "branch"
  | "other";

export type CompanyStatus = "published" | "draft" | "archived";

/** One company as returned by the LINDAS SPARQL query, before any derivation. */
export interface RawCompany {
  ehraid: string;
  uid: string | null;
  chid: string | null;
  legalName: string;
  purpose: string;
  /** Tail of the ech-0097 legal form URI, e.g. "0106". */
  legalFormCode: string | null;
  street: string | null;
  postalCode: string | null;
  locality: string | null;
  canton: string;
  bfsId: number | null;
}

/**
 * A register row after normalisation. Property names are the Directus field
 * names, so a CleanCompany can be written as-is.
 */
export interface CleanCompany {
  ehraid: string;
  /** Normalised, no dots: CHE107036057. */
  uid: string | null;
  chid: string | null;
  register_url: string;
  legal_name: string;
  purpose_text: string;
  purpose_hash: string;
  legal_form_code: string | null;
  legal_form_kind: LegalFormKind;
  in_liquidation: boolean;
  street_address: string | null;
  postal_code: string | null;
  locality: string | null;
  canton: string;
  bfs_id: number | null;
  lat: number | null;
  lng: number | null;
  geo_source: "postcode_centroid" | null;
}

export interface ClassificationResult {
  classification: Classification;
  classification_confidence: number | null;
  classification_reason: string | null;
  classification_model: string | null;
  classified_at: string | null;
  /** The purpose hash this result was computed for; a different hash means "reclassify". */
  classified_purpose_hash: string | null;
}

export type ClassifiedCompany = CleanCompany & ClassificationResult;

/** A `companies` row as read back from Directus. Only fields the pipeline reads are typed. */
export interface CmsCompany {
  id: string;
  ehraid: string;
  status: CompanyStatus;
  canton: string | null;
  uid: string | null;
  purpose_hash: string | null;
  classification: Classification | null;
  classification_confidence: number | string | null;
  classified_purpose_hash: string | null;
  classification_override: Classification | null;
  do_not_display: boolean | null;
  register_gone_at: string | null;
  partner: string | null;
  [field: string]: unknown;
}

export type PlanBucket = "CREATE" | "UPDATE" | "GONE" | "REAPPEARED" | "UNCHANGED";

export interface PlanEntry {
  bucket: PlanBucket;
  ehraid: string;
  legalName: string;
  canton: string;
  cmsId?: string;
  /** Field-level diff for UPDATE / GONE / REAPPEARED. Empty for CREATE and UNCHANGED. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** Full row, CREATE only. */
  payload?: Record<string, unknown>;
  /** The status this entry moves the row to, when it changes publication. */
  statusFlip?: "PUBLISH" | "UNPUBLISH";
  /** Classification as it will be stored, for the plan summary. */
  classification?: Classification;
}

export interface CompanyPlan {
  createdAt: string;
  sourceFile: string;
  /** Rows in the CMS that count against this run (not already gone, inside the scope). */
  cmsCount: number;
  candidateCount: number;
  /** Cantons this run covered; absent means all of Switzerland. */
  scopeCantons?: string[];
  entries: PlanEntry[];
  /** ehraids already written, so an interrupted apply can resume. */
  completed: string[];
}
