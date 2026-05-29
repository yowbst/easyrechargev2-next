# Partner Stats Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/partners/[uuid]/stats` route with six aggregate widgets (3 KPIs, pipeline funnel, 12-month volume, two reasons-breakdown charts) so a partner can answer "what's stalling / am I winning / how am I trending" in 10 seconds without leaving the same sidebar shell as the CRM.

**Architecture:** New server page mirrors `crm/page.tsx` — fetches the same `partner_dispatches` (no new tables) plus the partner's resolved scoring weights, and renders a single `<StatsBoard>` client component inside the existing `<PartnerSidebar>`. The board reads the existing `usePartnerFilter()` so partners flip between CRM and Stats with the same date window. A new pure module `src/lib/dispatch/stats.ts` does all aggregation math (kpis, monthly buckets, top reasons, funnel oldest-in-stage). Each widget is a small presentational component receiving pre-computed props — Recharts inside `Card`.

**Tech Stack:** Next.js 16 App Router (Server + Client Components), TypeScript, Recharts (already installed), shadcn `Card` primitive, existing `PartnerFilterContext` / `makePartnerT` / `scoreLead`. Directus only used to seed i18n strings on the existing `partner-crm` page — no schema change.

---

## Pre-requisite (i18n only, no schema)

The stats route reuses the `partner-crm` dictionary. Task 9 seeds the new
`stats.*` and `sidebar.nav.stats` keys onto its French translation via the
existing PATCH-by-page script — same pattern used throughout this branch.

---

### Task 1: Aggregation module

**Files:**
- Create: `src/lib/dispatch/stats.ts`

- [ ] **Step 1: Write the module**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/dispatch/stats.ts
git commit -m "feat(partner): aggregation module for the stats dashboard"
```

---

### Task 2: KPI tile component

**Files:**
- Create: `src/components/partners/stats/KpiTile.tsx`

- [ ] **Step 1: Write the tile**

```tsx
"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  fraction,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  fraction?: string;
  sparkline?: React.ReactNode;
}) {
  const arrow =
    typeof delta === "number"
      ? delta > 0
        ? ArrowUp
        : delta < 0
          ? ArrowDown
          : Minus
      : null;
  const deltaTone =
    typeof delta === "number" && delta !== 0
      ? delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {(arrow || fraction) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {arrow && (
            <span className={`inline-flex items-center gap-0.5 ${deltaTone}`}>
              {(() => {
                const Icon = arrow;
                return <Icon className="h-3 w-3" aria-hidden />;
              })()}
              <span className="tabular-nums">
                {delta! > 0 ? `+${delta}` : delta}
              </span>
              {deltaLabel && <span className="ml-1 text-muted-foreground">{deltaLabel}</span>}
            </span>
          )}
          {fraction && <span className="text-muted-foreground tabular-nums">{fraction}</span>}
        </div>
      )}
      {sparkline && <div className="mt-2 h-8">{sparkline}</div>}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partners/stats/KpiTile.tsx
git commit -m "feat(partner): KPI tile component"
```

---

### Task 3: Pipeline funnel card

**Files:**
- Create: `src/components/partners/stats/PipelineFunnelCard.tsx`

- [ ] **Step 1: Write the card**

```tsx
"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { FunnelRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

const BAR_COLOR = "hsl(var(--primary))";

export function PipelineFunnelCard({
  rows,
  dictionary,
}: {
  rows: FunnelRow[];
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const data = rows.map((r) => ({
    stage: t(`stages.${r.stage}`),
    count: r.count,
    oldestDays: r.oldestDays,
  }));
  const empty = rows.every((r) => r.count === 0);
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{t("stats.funnel.title")}</h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={110}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                cursor={{ fill: "transparent" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as {
                    stage: string;
                    count: number;
                    oldestDays: number | null;
                  };
                  return (
                    <div className="rounded border bg-popover px-2 py-1 text-xs shadow-md">
                      <p className="font-medium">{r.stage}</p>
                      <p className="text-muted-foreground">
                        {r.count} ·{" "}
                        {r.oldestDays !== null
                          ? t("stats.funnel.oldest", { n: r.oldestDays })
                          : "—"}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partners/stats/PipelineFunnelCard.tsx
git commit -m "feat(partner): pipeline funnel card"
```

---

### Task 4: Monthly volume card

**Files:**
- Create: `src/components/partners/stats/MonthlyVolumeCard.tsx`

- [ ] **Step 1: Write the card**

```tsx
"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { MonthlyBucket } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

export function MonthlyVolumeCard({
  series,
  dictionary,
}: {
  series: MonthlyBucket[];
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{t("stats.monthly.title")}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
            <RechartsTooltip
              cursor={{ fill: "transparent" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as MonthlyBucket;
                return (
                  <div className="rounded border bg-popover px-2 py-1 text-xs shadow-md">
                    {r.label} : {r.count}
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {series.map((b, i) => (
                <Cell
                  key={i}
                  fill={b.current ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partners/stats/MonthlyVolumeCard.tsx
git commit -m "feat(partner): monthly volume card"
```

---

### Task 5: Reasons breakdown card

**Files:**
- Create: `src/components/partners/stats/ReasonsBreakdownCard.tsx`

- [ ] **Step 1: Write the card (generic — used twice with different labelNs)**

```tsx
"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ReasonRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

export function ReasonsBreakdownCard({
  title,
  rows,
  labelNs,
  dictionary,
}: {
  title: string;
  rows: ReasonRow[];
  /** Dictionary namespace for value labels — "reasons" or "lost_reasons". */
  labelNs: "reasons" | "lost_reasons";
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const data = rows.map((r) => ({
    label: t(`${labelNs}.${r.key}.label`),
    count: r.count,
  }));
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                cursor={{ fill: "transparent" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as { label: string; count: number };
                  return (
                    <div className="rounded border bg-popover px-2 py-1 text-xs shadow-md">
                      {r.label} : {r.count}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/partners/stats/ReasonsBreakdownCard.tsx
git commit -m "feat(partner): generic reasons breakdown card"
```

---

### Task 6: StatsBoard container

**Files:**
- Create: `src/components/partners/StatsBoard.tsx`

- [ ] **Step 1: Write the board (composes the 6 widgets and computes everything via useMemo)**

```tsx
"use client";

import { useMemo } from "react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import {
  monthlyVolume,
  avgScoreByMonth,
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

const MAIN_STAGES = ["new", "contacted", "appointment", "quote_sent"];

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
}: {
  dispatches: PartnerDispatchCard[];
  scoringWeights: ScoringWeights;
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const { filter, inRange } = usePartnerFilter();

  const data = useMemo(() => {
    const prev = previousRange(filter);
    const kpis = summarize(dispatches, inRange, prev, scoringWeights);
    const funnel = pipelineStats(dispatches, inRange, MAIN_STAGES);
    const monthly = monthlyVolume(dispatches);
    const sparkline = avgScoreByMonth(dispatches, scoringWeights, 6);
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
    return { kpis, funnel, monthly, sparkline, lost, disq };
  }, [dispatches, scoringWeights, inRange, filter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiTile
          label={t("stats.kpi.leads")}
          value={String(data.kpis.leads)}
          delta={data.kpis.leadsDelta}
          deltaLabel={t("stats.kpi.delta")}
        />
        <KpiTile
          label={t("stats.kpi.conversion")}
          value={
            data.kpis.conversionPct === null ? "—" : `${data.kpis.conversionPct}%`
          }
          fraction={
            data.kpis.closed > 0 ? `${data.kpis.won} / ${data.kpis.closed}` : undefined
          }
        />
        <KpiTile
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
                  stroke="hsl(var(--primary))"
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
          title={t("stats.reasons.lost")}
          rows={data.lost}
          labelNs="lost_reasons"
          dictionary={dictionary}
        />
        <ReasonsBreakdownCard
          title={t("stats.reasons.disq")}
          rows={data.disq}
          labelNs="reasons"
          dictionary={dictionary}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/partners/StatsBoard.tsx
git commit -m "feat(partner): stats board composing the six widgets"
```

---

### Task 7: Stats route (server page)

**Files:**
- Create: `src/app/partners/[uuid]/stats/page.tsx`

- [ ] **Step 1: Write the page (mirrors crm/page.tsx)**

```tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { findPartnerByToken } from "@/lib/partner-auth";
import { fetchPartnerDispatches } from "@/lib/dispatch/partner-dashboard-queries";
import { resolveWeights } from "@/lib/dispatch/scoring";
import { fetchPage } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { slugToDirectusLocale } from "@/lib/i18n/config";
import { PartnerSidebar } from "@/components/partners/PartnerSidebar";
import { StatsBoard } from "@/components/partners/StatsBoard";

export const metadata: Metadata = {
  title: "Statistiques — Espace partenaire",
  robots: { index: false, follow: false },
};

const SUPPORTED_LANGS = ["fr", "de"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const SUPPORT_EMAIL = "yoan@easyrecharge.ch";

function buildSupportMailto(opts: {
  partnerName: string;
  partnerSlug: string;
  dashboardToken: string;
  lang: string;
}): string {
  const subject = `[Stats partenaire] ${opts.partnerName} — `;
  const url = `https://easyrecharge.ch/${opts.lang}/partners/${opts.dashboardToken}/stats`;
  const body = [
    "Bonjour Yoan,",
    "",
    "[Décris ici ta question ou ton problème.]",
    "",
    "---",
    `Partenaire : ${opts.partnerName} (${opts.partnerSlug})`,
    `Stats : ${url}`,
    "",
  ].join("\n");
  const params = new URLSearchParams({ subject, body });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

export default async function PartnerStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { uuid } = await params;
  const { lang: langParam } = await searchParams;
  const lang: Lang =
    langParam && (SUPPORTED_LANGS as readonly string[]).includes(langParam)
      ? (langParam as Lang)
      : "fr";

  const partner = await findPartnerByToken(uuid);
  if (!partner) notFound();

  const locale = slugToDirectusLocale(lang);
  const [dispatches, page] = await Promise.all([
    fetchPartnerDispatches(partner.id),
    fetchPage("partner-crm", locale),
  ]);
  const dictionary = page ? extractPageDictionary("partner-crm", page, locale) : {};

  const scoringWeights = resolveWeights(partner.lead_scoring_weights);
  const supportHref = buildSupportMailto({
    partnerName: partner.name,
    partnerSlug: partner.slug,
    dashboardToken: uuid,
    lang,
  });

  // Facet options aren't relevant on this page (no per-card filtering yet),
  // but the sidebar prop is required → pass empty arrays.
  const facetOptions = { housing: [], deadline: [], approval: [], score: [] };

  return (
    <PartnerSidebar
      partnerToken={uuid}
      partnerName={partner.name}
      leadCount={dispatches.length}
      supportHref={supportHref}
      activeNav="stats"
      lang={lang}
      dictionary={dictionary}
      facetOptions={facetOptions}
    >
      <StatsBoard
        dispatches={dispatches}
        scoringWeights={scoringWeights}
        dictionary={dictionary}
      />
    </PartnerSidebar>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/partners/[uuid]/stats/page.tsx
git commit -m "feat(partner): stats route at /partners/[uuid]/stats"
```

---

### Task 8: Sidebar nav — add Stats item, widen PartnerNav

**Files:**
- Modify: `src/components/partners/PartnerSidebar.tsx`

- [ ] **Step 1: Widen the PartnerNav type**

Change the `PartnerNav` export from `"crm"` to `"crm" | "stats"`:

```ts
export type PartnerNav = "crm" | "stats";
```

- [ ] **Step 2: Import the icon**

Add `BarChart3` to the existing lucide import block:

```ts
import { Users, LifeBuoy, CircleDashed, Ban, Archive, BarChart3 } from "lucide-react";
```

- [ ] **Step 3: Add the Stats nav item below the CRM item**

Inside the same `<SidebarMenu>` as the existing `<SidebarMenuItem>` for CRM, append a second `<SidebarMenuItem>` for Stats. Hide the CRM subnav when `activeNav === "stats"` (and vice versa) so only the active section's anchors show:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    isActive={activeNav === "stats"}
    tooltip={t("sidebar.nav.stats")}
    className="font-medium"
    render={
      <Link href={`/${lang}/partners/${partnerToken}/stats`} prefetch={false} />
    }
  >
    <BarChart3 className="h-4 w-4" />
    <span>{t("sidebar.nav.stats")}</span>
  </SidebarMenuButton>
</SidebarMenuItem>
```

Wrap the existing CRM `<SidebarMenuSub>` with `{activeNav === "crm" && (…)}` so the open/disqualified/closed anchors only render on the CRM page.

- [ ] **Step 4: Build to catch typing/JSX issues**

Run: `npm run build`
Expected: `✓ Compiled successfully`.

- [ ] **Step 5: Commit**

```bash
git add src/components/partners/PartnerSidebar.tsx
git commit -m "feat(partner): Stats sidebar nav item"
```

---

### Task 9: Seed i18n keys on the partner-crm page

**Files:**
- Modify: Directus (`pages` collection, `partner-crm` page, `fr-FR` translation `content`)

- [ ] **Step 1: PATCH the keys via the project's curl/python pattern**

```bash
set -a; source .env.local; set +a; python3 <<'PY'
import json, os, subprocess
TOKEN = os.environ['DIRECTUS_STATIC_TOKEN']; URL = os.environ['DIRECTUS_URL']
def directus(method, path, body=None):
    cmd = ["curl","-s","-X",method,
           "-H",f"Authorization: Bearer {TOKEN}",
           "-H","Content-Type: application/json"]
    if body is not None: cmd += ["-d", json.dumps(body)]
    cmd += [f"{URL}/items/{path}"]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)

PAGE_ID = "2d46798b-6f9b-4107-87cd-0967616c66e5"
page = directus("GET",
    f"pages/{PAGE_ID}?fields=translations.id,translations.languages_code,translations.content")
fr = next(t for t in page["data"]["translations"] if t["languages_code"] == "fr-FR")
content = fr["content"]

content.setdefault("sidebar", {}).setdefault("nav", {})["stats"] = "Statistiques"
content["stats"] = {
    "title": "Statistiques",
    "empty": "Aucun lead dans cette période",
    "kpi": {
        "leads": "Leads",
        "delta": "vs période précédente",
        "conversion": "Taux de conversion",
        "avg_quality": "Qualité moyenne",
    },
    "funnel": {
        "title": "Funnel",
        "oldest": "Plus ancien : il y a {n} j",
    },
    "monthly": {"title": "Volume mensuel"},
    "reasons": {
        "lost": "Motifs de perte",
        "disq": "Motifs de disqualification",
    },
}

out = directus("PATCH", f"pages/{PAGE_ID}",
    {"translations": {"update": [{"id": fr["id"], "content": content}],
                       "create": [], "delete": []}})
print("ERR" if "errors" in out else "OK")
PY
```

- [ ] **Step 2: Verify the keys came back**

Read the page back with the same script and assert that
`content["sidebar"]["nav"]["stats"]`, `content["stats"]["kpi"]["leads"]`,
and `content["stats"]["monthly"]["title"]` are all set.

(No code commit — Directus is the source of truth.)

---

### Task 10: Verify end-to-end + push

- [ ] **Step 1: Typecheck + lint + production build**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all clean.

- [ ] **Step 2: Smoke-test the route in dev**

Run: `npm run dev`
Open: `http://localhost:3000/fr/partners/<DEV_TOKEN>/stats`

Expected:
- Sidebar shows two items — CRM and Statistiques; Statistiques is highlighted.
- KPI strip renders three tiles. `Leads (N)` + a `+/-` delta with arrow.
- Pipeline funnel shows four bars (new / contacted / appointment / quote_sent).
- Monthly volume shows 12 bars, the rightmost tinted primary.
- Two reasons-breakdown cards render (or each shows `Aucun lead dans cette période` if the dev partner has no closed leads yet).
- Changing the date filter in the header updates the KPI tiles and funnel; the monthly volume and reasons cards do NOT change.
- Clicking the CRM nav item returns to the CRM with no console errors.

- [ ] **Step 3: Sanity-check one number by hand**

Pick the `Leads` tile, switch the filter to "30 derniers jours", and verify
the displayed count matches `localDispatches.filter(d => withinLast30Days(d.dispatched_at)).length`
when you run the same condition against the CRM.

- [ ] **Step 4: Commit the full feature + push to staging**

```bash
git add -A
git commit -m "feat(partner): stats dashboard route + sidebar nav"
git push origin staging
```

(If earlier tasks already committed atomically, this final commit may be
empty — `git commit --allow-empty -m "chore: stats dashboard ready"` or
simply skip the commit and just push.)

---

## Out of scope (v1)

- CSV export, scheduled emails, admin/cross-partner view, per-canton breakdowns,
  configurable widgets (drag/hide/reorder), pre-aggregated tables, German
  translations. See the design doc for rationale.
