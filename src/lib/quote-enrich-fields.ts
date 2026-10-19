/**
 * The six questions the lean funnel dropped, asked again after sending (flag
 * `quote-enrich`). Shared by the client step and the server route, so no
 * server-only import here.
 */
import { isProduct, type Product } from "@/lib/products";

export type EnrichRule = { kind: "choice"; values: readonly string[] } | { kind: "number"; min: number; max: number };

/** The six fields, the step they used to belong to (labels, buckets), and what they accept. */
export const ENRICH_FIELDS = {
  electricalBoardType: { step: "housing", rule: { kind: "choice", values: ["old", "recent", "na"] } },
  electricalLineDistance: { step: "parking", rule: { kind: "number", min: 0, max: 500 } },
  electricalLineHoleCount: { step: "parking", rule: { kind: "number", min: 0, max: 20 } },
  ecpProvided: { step: "charger", rule: { kind: "choice", values: ["include", "exclude"] } },
  vehicleTripDistance: { step: "vehicle", rule: { kind: "number", min: 0, max: 2000 } },
  vehicleChargingHours: { step: "vehicle", rule: { kind: "number", min: 0, max: 24 } },
} as const satisfies Record<string, { step: string; rule: EnrichRule }>;

export type EnrichField = keyof typeof ENRICH_FIELDS;
export const ENRICH_FIELD_KEYS = Object.keys(ENRICH_FIELDS) as EnrichField[];

/**
 * Which products ask the follow-up questions after sending. One entry per
 * product, so a new product has to answer; only the charger dropped questions
 * from its funnel.
 */
const ENRICHABLE: Record<Product, boolean> = { ecp: true, battery: false };

export function isEnrichable(product: unknown): boolean {
  return isProduct(product) && ENRICHABLE[product];
}
