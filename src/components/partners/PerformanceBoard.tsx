"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CalendarCheck,
  FileText,
  Trophy,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  costPerStage,
  investmentSum,
  overallConversionRate,
  pipelineStats,
  stageCostByBand,
  transitionByBand,
  transitionRates,
  type OverallConversion,
  type ScoringWeights,
  type StageCostByBand,
  type StageCostRow,
  type TransitionByBand,
  type TransitionRow,
} from "@/lib/dispatch/stats";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import { matchesFacets } from "@/lib/partner-facets";
import { usePartnerFilter } from "./PartnerFilterContext";
import { makePartnerT, type PartnerDict, type PartnerT } from "@/lib/partner-i18n";
import { KpiTile } from "./stats/KpiTile";

const MAIN_STAGES = ["new", "contacted", "appointment", "quote_sent", "won"];

const CHF = new Intl.NumberFormat("fr-CH", {
  style: "currency",
  currency: "CHF",
  maximumFractionDigits: 0,
});

function fmtChf(n: number | null): string {
  return n === null ? "—" : CHF.format(n);
}

function pct(n: number | null): string {
  return n === null ? "—" : `${n}%`;
}

/**
 * Subset of stage cost rows we surface on this page — the stages where the
 * cost-per-prospect signal is most actionable for the partner.
 */
function pickStageCost(rows: StageCostRow[], stage: string): StageCostRow | null {
  return rows.find((r) => r.stage === stage) ?? null;
}

const CAC_STAGES = ["appointment", "quote_sent", "won"];

const STAGE_ICON: Record<string, typeof CalendarCheck> = {
  appointment: CalendarCheck,
  quote_sent: FileText,
  won: Trophy,
};

// Star glyphs + tone classes for the lead-quality breakdown (matches the
// score chip on the lead card).
const BAND_GLYPH: Record<string, string> = {
  hot: "★★★",
  warm: "★★",
  cold: "★",
};
const BAND_TONE: Record<string, string> = {
  hot: "text-emerald-600 dark:text-emerald-400",
  warm: "text-amber-600 dark:text-amber-400",
  cold: "text-blue-600 dark:text-blue-400",
};

export function PerformanceBoard({
  dispatches,
  scoringWeights,
  dictionary,
  lookbackDaysByStage,
}: {
  dispatches: PartnerDispatchCard[];
  scoringWeights: ScoringWeights;
  dictionary: PartnerDict;
  lookbackDaysByStage: Record<string, number>;
}) {
  const t = makePartnerT(dictionary);
  const { inRange, facets } = usePartnerFilter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const data = useMemo(() => {
    const filtered = dispatches.filter((d) =>
      matchesFacets(d, facets, scoringWeights),
    );
    const investment = investmentSum(filtered, inRange);
    const funnel = pipelineStats(filtered, inRange, MAIN_STAGES);
    const transitions = transitionRates(
      filtered,
      inRange,
      MAIN_STAGES,
      lookbackDaysByStage,
    );
    const overall = overallConversionRate(
      filtered,
      inRange,
      lookbackDaysByStage?.won ?? 30,
    );
    // Per-band sub-breakdowns for each cascade row and each CAC row.
    const transitionsByBand: Record<string, TransitionByBand[]> = {};
    for (const r of transitions) {
      transitionsByBand[`${r.from}-${r.to}`] = transitionByBand(
        filtered,
        inRange,
        r.from,
        r.to,
        r.lookbackDays,
        scoringWeights,
      );
    }
    const stageCosts = costPerStage(funnel, investment);
    const cacRows = CAC_STAGES.map((s) => pickStageCost(stageCosts, s)).filter(
      (r): r is StageCostRow => r !== null,
    );
    const cacByBand: Record<string, StageCostByBand[]> = {};
    for (const r of cacRows) {
      cacByBand[r.stage] = stageCostByBand(
        filtered,
        inRange,
        r.stage,
        scoringWeights,
      );
    }
    const won = funnel.find((f) => f.stage === "won")?.count ?? 0;
    const appt = funnel.find((f) => f.stage === "appointment")?.count ?? 0;
    const quote = funnel.find((f) => f.stage === "quote_sent")?.count ?? 0;
    return {
      investment,
      cac: won > 0 ? Math.round(investment / won) : null,
      costPerAppt: appt > 0 ? Math.round(investment / appt) : null,
      costPerQuote: quote > 0 ? Math.round(investment / quote) : null,
      transitions,
      transitionsByBand,
      overall,
      cacRows,
      cacByBand,
    };
  }, [dispatches, inRange, facets, lookbackDaysByStage, scoringWeights]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          Icon={Wallet}
          label={t("stats.performance.investment")}
          value={fmtChf(data.investment)}
        />
        <KpiTile
          Icon={Trophy}
          label={t("stats.performance.cac")}
          value={fmtChf(data.cac)}
        />
        <KpiTile
          Icon={CalendarCheck}
          label={t("stats.performance.cost_per_appt")}
          value={fmtChf(data.costPerAppt)}
        />
        <KpiTile
          Icon={FileText}
          label={t("stats.performance.cost_per_quote")}
          value={fmtChf(data.costPerQuote)}
        />
      </div>

      <ConversionCascade
        transitions={data.transitions}
        transitionsByBand={data.transitionsByBand}
        overall={data.overall}
        mounted={mounted}
        t={t}
      />

      <CacPerStage
        rows={data.cacRows}
        byBand={data.cacByBand}
        mounted={mounted}
        t={t}
      />
    </div>
  );
}

function ConversionCascade({
  transitions,
  transitionsByBand,
  overall,
  mounted,
  t,
}: {
  transitions: TransitionRow[];
  transitionsByBand: Record<string, TransitionByBand[]>;
  overall: OverallConversion;
  mounted: boolean;
  t: PartnerT;
}) {
  const empty = transitions.every((r) => r.fromCount === 0);
  return (
    <Card className="p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{t("stats.performance.cascade")}</span>
      </h3>

      {overall.total > 0 && (
        <div className="mb-3 rounded-md border bg-muted/40 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs font-medium">
              <span>{t("stages.new")}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span>{t("stages.won")}</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">
              {overall.rate === null ? "—" : `${overall.rate}%`}{" "}
              <span className="font-normal text-muted-foreground">
                ({overall.won}/{overall.total})
              </span>
            </span>
          </div>
          {overall.lookbackDays > 0 && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {t("stats.performance.maturity_row", { n: overall.lookbackDays })}
            </p>
          )}
        </div>
      )}

      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {t("stats.performance.maturity_hint")}
          </p>
          <ul className="divide-y divide-dotted divide-border">
            {transitions.map((r) => {
              const width = r.rate ?? 0;
              const bands = transitionsByBand[`${r.from}-${r.to}`] ?? [];
              return (
                <li
                  key={`${r.from}-${r.to}`}
                  className="grid grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5"
                >
                  <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-foreground">
                        {t(`stages.${r.from}`)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">
                        {t(`stages.${r.to}`)}
                      </span>
                    </div>
                    {r.lookbackDays > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("stats.performance.maturity_row", {
                          n: r.lookbackDays,
                        })}
                      </span>
                    )}
                  </div>
                <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                    style={{ width: mounted ? `${width}%` : "0%" }}
                  />
                </div>
                <span className="w-20 text-right text-xs font-semibold tabular-nums">
                  {pct(r.rate)}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({r.toCount}/{r.fromCount})
                  </span>
                </span>
                {bands.some((b) => b.from > 0) && (
                  <div className="col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] text-muted-foreground">
                    {bands.map((b) =>
                      b.from === 0 ? null : (
                        <span
                          key={b.band}
                          className="inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span className={BAND_TONE[b.band]}>
                            {BAND_GLYPH[b.band]}
                          </span>
                          <span>
                            {pct(b.rate)}{" "}
                            <span className="opacity-70">
                              ({b.to}/{b.from})
                            </span>
                          </span>
                        </span>
                      ),
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        </>
      )}
    </Card>
  );
}

function CacPerStage({
  rows,
  byBand,
  mounted,
  t,
}: {
  rows: StageCostRow[];
  byBand: Record<string, StageCostByBand[]>;
  mounted: boolean;
  t: PartnerT;
}) {
  const max = rows.reduce(
    (m, r) => (r.costPer !== null && r.costPer > m ? r.costPer : m),
    0,
  );
  const empty = max === 0;
  return (
    <Card className="p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Banknote className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{t("stats.performance.cac_per_stage")}</span>
      </h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const Icon = STAGE_ICON[r.stage];
            const width =
              r.costPer !== null && max > 0 ? (r.costPer / max) * 100 : 0;
            const bands = byBand[r.stage] ?? [];
            return (
              <li key={r.stage} className="space-y-1">
                <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs">
                  <span className="flex min-w-0 items-center gap-1.5">
                    {Icon && (
                      <Icon
                        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                    <span className="truncate font-medium">
                      {t(`stages.${r.stage}`)}
                    </span>
                  </span>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out"
                      style={{ width: mounted ? `${width}%` : "0%" }}
                    />
                  </div>
                  <span className="w-24 text-right font-semibold tabular-nums">
                    {fmtChf(r.costPer)}
                  </span>
                </div>
                {bands.some((b) => b.count > 0) && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-5 text-[11px] text-muted-foreground">
                    {bands.map((b) =>
                      b.count === 0 ? null : (
                        <span
                          key={b.band}
                          className="inline-flex items-center gap-1.5 tabular-nums"
                        >
                          <span className={BAND_TONE[b.band]}>
                            {BAND_GLYPH[b.band]}
                          </span>
                          <span>
                            {fmtChf(b.costPer)}{" "}
                            <span className="opacity-70">({b.count})</span>
                          </span>
                        </span>
                      ),
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
