/** A Directus JSON spec field. Shared by the ingest writer and vehicleTransformer reader. */
export interface NumericField {
  value: number;
  unit: string;
}

export function isNumericField(v: unknown): v is NumericField {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.value === "number" && typeof o.unit === "string";
}

/** A row from the cleaned scrape snapshot. */
export interface ScrapedVehicle {
  evdb_id: number | string;
  make: string;
  make_slug: string;
  model: string;
  title_v2: string;
  slug: string;
  year: { from: number | null; to: number | null } | null;
  available: boolean | string;
  [key: string]: unknown;
}

/** A vehicles row as read back from Directus. */
export interface CmsVehicle {
  id: string;
  evdb_id: string | null;
  slug: string;
  status: string;
  [key: string]: unknown;
}

export type PlanBucket = "CREATE" | "UPDATE" | "SLUG_DRIFT" | "GONE" | "UNCHANGED";

export interface PlanEntry {
  bucket: PlanBucket;
  evdbId: string;
  slug: string;
  /** Directus item id. Absent for CREATE. */
  cmsId?: string;
  /** Only the fields that differ. Empty for every bucket except UPDATE. */
  changes: Record<string, { from: unknown; to: unknown }>;
  /** Full payload to POST. Only present for CREATE. */
  payload?: Record<string, unknown>;
  /** Populated for SLUG_DRIFT only — reported, never applied. */
  generatedSlug?: string;
}

export interface IngestPlan {
  createdAt: string;
  sourceFile: string;
  cmsCount: number;
  scrapeCount: number;
  entries: PlanEntry[];
  /** evdb_ids already applied, for resume. */
  completed: string[];
}
