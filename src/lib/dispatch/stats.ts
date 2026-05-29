import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import {
  scoreLead,
  type ScoringFactorKey,
} from "@/lib/dispatch/scoring";

export type ScoringWeights = Record<ScoringFactorKey, number>;

export interface KpiSummary {
  leads: number;
  /** count(window) − count(previous window of same length) */
  leadsDelta: number;
  won: number;
  closed: number;
  /** null when closed === 0 */
  conversionPct: number | null;
  /** null when no leads in window */
  avgScore: number | null;
}

export function summarize(
  cards: PartnerDispatchCard[],
  inRange: (iso: string) => boolean,
  prevInRange: (iso: string) => boolean,
  weights: ScoringWeights,
): KpiSummary {
  let leads = 0;
  let prevLeads = 0;
  let won = 0;
  let closed = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  for (const c of cards) {
    if (inRange(c.dispatched_at)) {
      leads += 1;
      if (c.stage === "won") {
        won += 1;
        closed += 1;
      } else if (c.stage === "lost") {
        closed += 1;
      }
      scoreSum += scoreLead(c.submission?.data, weights).score;
      scoreCount += 1;
    }
    if (prevInRange(c.dispatched_at)) prevLeads += 1;
  }
  return {
    leads,
    leadsDelta: leads - prevLeads,
    won,
    closed,
    conversionPct: closed > 0 ? Math.round((100 * won) / closed) : null,
    avgScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
  };
}

export interface MonthlyBucket {
  /** "yyyy-mm" key, unique. */
  key: string;
  /** Localised short month label (fr-CH). */
  label: string;
  count: number;
  /** True for the calendar month containing `now`. */
  current: boolean;
}

export function monthlyVolume(
  cards: PartnerDispatchCard[],
  now: Date = new Date(),
): MonthlyBucket[] {
  const series: MonthlyBucket[] = [];
  const counts: Record<string, number> = {};
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (let i = 11; i >= 0; i--) {
    const dd = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
    const label = dd.toLocaleDateString("fr-CH", { month: "short" });
    counts[key] = 0;
    series.push({ key, label, count: 0, current: key === nowKey });
  }
  for (const c of cards) {
    const dt = new Date(c.dispatched_at);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    if (key in counts) counts[key] += 1;
  }
  for (const s of series) s.count = counts[s.key];
  return series;
}

export function avgScoreByMonth(
  cards: PartnerDispatchCard[],
  weights: ScoringWeights,
  monthsBack = 6,
  now: Date = new Date(),
): { key: string; value: number | null }[] {
  const sums: Record<string, { total: number; n: number }> = {};
  const series: { key: string; value: number | null }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const dd = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
    sums[key] = { total: 0, n: 0 };
    series.push({ key, value: null });
  }
  for (const c of cards) {
    const dt = new Date(c.dispatched_at);
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const bucket = sums[key];
    if (!bucket) continue;
    bucket.total += scoreLead(c.submission?.data, weights).score;
    bucket.n += 1;
  }
  for (const s of series) {
    const b = sums[s.key];
    s.value = b.n > 0 ? Math.round(b.total / b.n) : null;
  }
  return series;
}

export interface FunnelRow {
  stage: string;
  count: number;
  /** Whole days the oldest open lead in this stage has been sitting. */
  oldestDays: number | null;
}

export function pipelineStats(
  cards: PartnerDispatchCard[],
  inRange: (iso: string) => boolean,
  stages: string[],
  now: Date = new Date(),
): FunnelRow[] {
  return stages.map((s) => {
    let count = 0;
    let oldestDays: number | null = null;
    for (const c of cards) {
      if (c.disqualified) continue;
      if (c.stage !== s) continue;
      if (!inRange(c.dispatched_at)) continue;
      count += 1;
      const enteredAt = c.stage_entered_at ?? c.dispatched_at;
      const days = Math.floor(
        (now.getTime() - new Date(enteredAt).getTime()) / 86_400_000,
      );
      if (oldestDays === null || days > oldestDays) oldestDays = days;
    }
    return { stage: s, count, oldestDays };
  });
}

export interface ReasonRow {
  key: string;
  count: number;
}

export function topReasons(
  cards: PartnerDispatchCard[],
  field: "lost_reason" | "disqualification_reason",
  predicate: (c: PartnerDispatchCard) => boolean,
  n = 5,
  withinMonths = 12,
  now: Date = new Date(),
): ReasonRow[] {
  const cutoff = new Date(
    now.getFullYear(),
    now.getMonth() - withinMonths,
    now.getDate(),
  ).getTime();
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (!predicate(c)) continue;
    if (new Date(c.dispatched_at).getTime() < cutoff) continue;
    const v = c[field];
    if (typeof v !== "string" || v.length === 0) continue;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
