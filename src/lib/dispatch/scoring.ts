/**
 * Lead scoring — a transparent 0–100 quality score from signals already
 * captured on every quote submission. Pure module (no framework deps) so it
 * can run on the server or client.
 *
 * Score = round(100 · Σ(wᵢ·sᵢ) / Σ(wᵢ)) over factors whose value is present.
 * A missing field drops its weight from numerator AND denominator, so it
 * neither helps nor unfairly penalises. Dividing by the present-weight sum
 * means per-partner weight overrides don't need to renormalise.
 */

export const SCORING_FACTOR_KEYS = [
  "ownership",
  "authorization",
  "urgency",
  "volume",
  "solar_upsell",
] as const;

export type ScoringFactorKey = (typeof SCORING_FACTOR_KEYS)[number];

export const DEFAULT_SCORING_WEIGHTS: Record<ScoringFactorKey, number> = {
  ownership: 0.2,
  authorization: 0.2,
  urgency: 0.25,
  volume: 0.2,
  solar_upsell: 0.15,
};

/** Lower bound (inclusive) for each band; below `warm` is "cold". */
export const SCORE_BANDS = { hot: 70, warm: 40 } as const;

export type ScoreBand = "hot" | "warm" | "cold";

export interface ScoreBreakdownItem {
  key: ScoringFactorKey;
  weight: number;
  /** 0..1 sub-score for this factor. */
  subScore: number;
}

export interface LeadScore {
  score: number; // 0..100
  band: ScoreBand;
  breakdown: ScoreBreakdownItem[];
}

function bandFor(score: number): ScoreBand {
  if (score >= SCORE_BANDS.hot) return "hot";
  if (score >= SCORE_BANDS.warm) return "warm";
  return "cold";
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v.toLowerCase() : null;

/** Per-factor 0..1 sub-score, or null when the source field is absent. */
function subScores(
  data: Record<string, unknown>,
): Record<ScoringFactorKey, number | null> {
  const housing = str(data.housingStatus);
  const approval = str(data.approval);
  const deadline = str(data.deadline);
  const parking = str(data.parkingSpotCount); // "1" | "2" | "3+"
  const solar = str(data.solarEquipment);

  const ownership =
    housing === "owner"
      ? 1
      : housing === "co-owner"
        ? 0.6
        : housing === "tenant"
          ? 0.3
          : null;

  // Owners can authorise the works themselves → full marks regardless of the
  // approval field (which the quote form only asks of co-owners/tenants).
  let authorization: number | null;
  if (housing === "owner") authorization = 1;
  else if (approval === "yes") authorization = 1;
  else if (approval === "in-progress") authorization = 0.5;
  else if (approval === "no") authorization = 0.1;
  else authorization = housing ? 0.4 : null;

  const urgency =
    deadline === "asap"
      ? 1
      : deadline === "2-3mo"
        ? 0.7
        : deadline === "3-6mo"
          ? 0.4
          : deadline === "6+mo"
            ? 0.2
            : null;

  const volume =
    parking === "3+" ? 1 : parking === "2" ? 0.7 : parking === "1" ? 0.4 : null;

  // No solar yet = biggest upsell opportunity.
  const solar_upsell =
    solar === "none"
      ? 1
      : solar === "in-progress"
        ? 0.5
        : solar === "exists"
          ? 0.2
          : null;

  return { ownership, authorization, urgency, volume, solar_upsell };
}

/** Merge a partner's weight override over the defaults (absent ⇒ defaults). */
export function resolveWeights(
  override?: Record<string, number> | null,
): Record<ScoringFactorKey, number> {
  const merged = { ...DEFAULT_SCORING_WEIGHTS };
  if (override) {
    for (const key of SCORING_FACTOR_KEYS) {
      const v = override[key];
      if (typeof v === "number" && v >= 0) merged[key] = v;
    }
  }
  return merged;
}

export function scoreLead(
  data: Record<string, unknown> | null | undefined,
  weights: Record<ScoringFactorKey, number>,
): LeadScore {
  const subs = subScores(data ?? {});
  let num = 0;
  let den = 0;
  const breakdown: ScoreBreakdownItem[] = [];
  for (const key of SCORING_FACTOR_KEYS) {
    const s = subs[key];
    const w = weights[key] ?? 0;
    if (s === null || w <= 0) continue;
    num += w * s;
    den += w;
    breakdown.push({ key, weight: w, subScore: s });
  }
  const score = den > 0 ? Math.round((100 * num) / den) : 0;
  return { score, band: bandFor(score), breakdown };
}
