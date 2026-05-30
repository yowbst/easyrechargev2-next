"use client";

import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Inbox, TrendingUp, Star, CircleX, Ban } from "lucide-react";
import {
  monthlyVolume,
  avgScoreByMonth,
  overallConversionRate,
  pipelineStats,
  summarize,
  topReasons,
  type ScoringWeights,
} from "@/lib/dispatch/stats";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { usePartnerFilter, type DateFilter } from "./PartnerFilterContext";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";
import { KpiTile } from "./stats/KpiTile";
import { PipelineFunnelCard } from "./stats/PipelineFunnelCard";
import { MonthlyVolumeCard } from "./stats/MonthlyVolumeCard";
import { ReasonsBreakdownCard } from "./stats/ReasonsBreakdownCard";

// Funnel stages, in order, ending at the success terminal "won".
const MAIN_STAGES = ["new", "contacted", "appointment", "quote_sent", "won"];

// Build a predicate that matches the window immediately preceding the active
// filter, with the same length. For "all" we still need something — use a
// far-past predicate so the delta reads as zero.
function previousRange(filter: DateFilter): (iso: string) => boolean {
  const now = Date.now();
  const DAY = 86_400_000;
  let upper: number;
  let lower: number;
  if (filter.preset === "7d" || filter.preset === "30d" || filter.preset === "90d") {
    const days = filter.preset === "7d" ? 7 : filter.preset === "30d" ? 30 : 90;
    upper = now - days * DAY;
    lower = upper - days * DAY;
  } else if (filter.preset === "month" && filter.month) {
    const [y, m] = filter.month.split("-").map(Number);
    upper = new Date(y, m - 1, 1).getTime() - 1;
    lower = new Date(y, m - 2, 1).getTime();
  } else if (filter.preset === "custom" && (filter.from || filter.to)) {
    const from = filter.from
      ? new Date(`${filter.from}T00:00:00`).getTime()
      : now;
    const to = filter.to
      ? new Date(`${filter.to}T23:59:59`).getTime()
      : now;
    const len = Math.max(0, to - from);
    upper = from - 1;
    lower = upper - len;
  } else {
    // "all" — no comparable previous window.
    return () => false;
  }
  return (iso) => {
    const ts = new Date(iso).getTime();
    return ts >= lower && ts <= upper;
  };
}

export function StatsBoard({
  dispatches,
  scoringWeights,
  dictionary,
  lookbackDaysByStage,
}: {
  dispatches: PartnerDispatchCard[];
  scoringWeights: ScoringWeights;
  dictionary: PartnerDict;
  lookbackDaysByStage?: Record<string, number>;
}) {
  const t = makePartnerT(dictionary);
  const { filter, inRange } = usePartnerFilter();

  const data = useMemo(() => {
    const prev = previousRange(filter);
    const kpis = summarize(dispatches, inRange, prev, scoringWeights);
    const funnel = pipelineStats(dispatches, inRange, MAIN_STAGES);
    const monthly = monthlyVolume(dispatches);
    const sparkline = avgScoreByMonth(dispatches, scoringWeights, 6);
    // Conversion = end-to-end (new → won), maturity-gated by the "won"
    // lookback. Same metric as the Performance tab so the two views agree.
    const overall = overallConversionRate(
      dispatches,
      inRange,
      lookbackDaysByStage?.won ?? 30,
    );
    const lost = topReasons(
      dispatches,
      "lost_reason",
      (c) => c.stage === "lost" && !!c.lost_reason,
    );
    const disq = topReasons(
      dispatches,
      "disqualification_reason",
      (c) => c.disqualified && !!c.disqualification_reason,
    );
    return { kpis, funnel, monthly, sparkline, overall, lost, disq };
  }, [dispatches, scoringWeights, inRange, filter, lookbackDaysByStage]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          Icon={Inbox}
          label={t("stats.kpi.leads")}
          value={String(data.kpis.leads)}
          delta={data.kpis.leadsDelta}
          deltaLabel={t("stats.kpi.delta")}
        />
        <KpiTile
          Icon={TrendingUp}
          label={t("stats.kpi.conversion")}
          value={data.overall.rate === null ? "—" : `${data.overall.rate}%`}
          fraction={
            data.overall.total > 0
              ? `${data.overall.won} / ${data.overall.total}`
              : undefined
          }
        />
        <KpiTile
          Icon={Star}
          label={t("stats.kpi.avg_quality")}
          value={data.kpis.avgScore === null ? "—" : String(data.kpis.avgScore)}
          sparkline={
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data.sparkline.map((s) => ({
                  v: s.value ?? 0,
                }))}
              >
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke="var(--primary)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          }
        />
      </div>

      <PipelineFunnelCard rows={data.funnel} dictionary={dictionary} />

      <MonthlyVolumeCard series={data.monthly} dictionary={dictionary} />

      <div className="grid gap-4 md:grid-cols-2">
        <ReasonsBreakdownCard
          Icon={Ban}
          title={t("stats.reasons.disq")}
          rows={data.disq}
          labelNs="reasons"
          dictionary={dictionary}
          fill="rgb(217 119 6)"
        />
        <ReasonsBreakdownCard
          Icon={CircleX}
          title={t("stats.reasons.lost")}
          rows={data.lost}
          labelNs="lost_reasons"
          dictionary={dictionary}
          fill="rgb(225 29 72)"
        />
      </div>
    </div>
  );
}
