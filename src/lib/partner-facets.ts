/**
 * Shared facet helpers for the partner section. The Leads board and the
 * Stats boards both filter the dispatch list by these attribute facets;
 * keeping the logic in one place avoids drift between views.
 */

import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { scoreLead, type ScoringFactorKey } from "@/lib/dispatch/scoring";
import type { Facets } from "@/components/partners/PartnerFilterContext";

type ScoringWeights = Record<ScoringFactorKey, number>;

const HOUSING_ORDER = ["owner", "co-owner", "tenant"];
const APPROVAL_ORDER = ["yes", "in-progress", "no"];
const DEADLINE_ORDER = ["asap", "2-3mo", "3-6mo", "6+mo"];
const SCORE_ORDER = ["hot", "warm", "cold"];

/**
 * Distinct lead-attribute values present in `dispatches`, ordered for display.
 * Derived from real data so the facet menu never offers a value that no lead
 * currently has.
 */
export function collectFacetOptions(
  dispatches: PartnerDispatchCard[],
  scoringWeights: ScoringWeights,
): Facets {
  const housing = new Set<string>();
  const deadline = new Set<string>();
  const approval = new Set<string>();
  const score = new Set<string>();
  for (const d of dispatches) {
    const data = (d.submission?.data ?? {}) as Record<string, unknown>;
    if (typeof data.housingStatus === "string")
      housing.add(data.housingStatus.toLowerCase());
    if (typeof data.deadline === "string") deadline.add(data.deadline);
    if (typeof data.approval === "string")
      approval.add(data.approval.toLowerCase());
    score.add(scoreLead(data, scoringWeights).band);
  }
  const order = (set: Set<string>, pref: string[]) =>
    [...set].sort((a, b) => {
      const ia = pref.indexOf(a);
      const ib = pref.indexOf(b);
      if (ia !== -1 || ib !== -1)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return a.localeCompare(b);
    });
  return {
    housing: order(housing, HOUSING_ORDER),
    deadline: order(deadline, DEADLINE_ORDER),
    approval: order(approval, APPROVAL_ORDER),
    score: order(score, SCORE_ORDER),
  };
}

/**
 * AND across facet groups, OR within. An empty group doesn't constrain.
 */
export function matchesFacets(
  d: PartnerDispatchCard,
  facets: Facets,
  scoringWeights: ScoringWeights,
): boolean {
  const data = (d.submission?.data ?? {}) as Record<string, unknown>;
  if (facets.housing.length > 0) {
    const v =
      typeof data.housingStatus === "string"
        ? data.housingStatus.toLowerCase()
        : null;
    if (!v || !facets.housing.includes(v)) return false;
  }
  if (facets.deadline.length > 0) {
    const v = typeof data.deadline === "string" ? data.deadline : null;
    if (!v || !facets.deadline.includes(v)) return false;
  }
  if (facets.approval.length > 0) {
    const v =
      typeof data.approval === "string" ? data.approval.toLowerCase() : null;
    if (!v || !facets.approval.includes(v)) return false;
  }
  if (facets.score.length > 0) {
    const band = scoreLead(data, scoringWeights).band;
    if (!facets.score.includes(band)) return false;
  }
  return true;
}
