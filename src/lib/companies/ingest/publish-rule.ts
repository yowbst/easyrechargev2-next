import type { Classification, CompanyStatus } from "./types";

export const MIN_PUBLISH_CONFIDENCE = 0.8;

export interface PublishInput {
  classification: Classification | null;
  confidence: number | null;
  /** Human override; wins over the model whatever its confidence. */
  override: Classification | null;
  inLiquidation: boolean;
  doNotDisplay: boolean;
  gone: boolean;
  /** Explicit installation wording in the purpose (see installationEvidence). */
  evidence?: "explicit" | "weak";
  /** Linked to an easyRecharge partner. */
  isPartner?: boolean;
}

/**
 * The status a company should have. The pipeline recomputes this on every
 * plan, so humans never edit `status`: they use `do_not_display` or
 * `classification_override` and the next plan follows.
 */
export function computeStatus(i: PublishInput): CompanyStatus {
  if (i.gone) return "archived";
  if (i.doNotDisplay || i.inLiquidation) return "draft";
  if (i.override) return i.override === "installer" ? "published" : "draft";
  if (i.isPartner) return "published";
  return i.classification === "installer" &&
    (i.confidence ?? 0) >= MIN_PUBLISH_CONFIDENCE &&
    (i.evidence ?? "explicit") === "explicit"
    ? "published"
    : "draft";
}

/** The classification everything downstream reads: a human override beats the model. */
export const effectiveClassification = (row: {
  classification: Classification | null;
  classification_override: Classification | null;
}): Classification | null => row.classification_override ?? row.classification;
