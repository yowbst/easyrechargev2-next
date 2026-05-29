# Partner Stats Dashboard — Design

## Goal

A focused, 6-card stats page that sits next to the partner CRM and lets a
partner answer three questions in 10 seconds:

- **Operational** — what's stalling in my pipeline right now?
- **Commercial** — what am I getting this month?
- **Performance** — how are things trending over time, and why do deals die?

All inputs come from `partner_dispatches` (no new data, no new tables).
The page shares the CRM's date filter so partners can flip between *CRM*
and *Stats* with the same window.

## Scope (v1)

Six widgets, three themes — kept tight so it doesn't drift into a BI tool.

### 1) KPI strip (3 small tiles, top)

| Tile | Value | Sub-line |
|---|---|---|
| **Leads (période)** | count of dispatches in the active filter window | Δ vs previous window of the same length (`+8 vs période précédente`) |
| **Taux de conversion** | `won / (won + lost)` in window, formatted % | small fraction `12 / 34` underneath |
| **Qualité moyenne** | average `scoreLead(d).score` in window, as a number + star band of that average | 6-month sparkline of monthly avg score (always 6 mo, regardless of filter) |

Time scope: KPIs respect the CRM date filter; sparkline does not.

### 2) Pipeline funnel — operational (full width)

Horizontal bars per active stage in order: **new → contacted → appointment → quote_sent**.
- Bar length: count of dispatches in that stage (active, not disqualified, not won/lost) within the filter window.
- Right-side meta on each bar: `(N) · plus ancien : il y a Xj`.
- Stage labels reuse `stages.*` from the existing dictionary.

### 3) Volume mensuel — performance (full width)

12-month bar chart of leads received per calendar month. Current month is
the rightmost bar (tinted primary). Hover shows the count.
- Always last 12 months — filter is ignored (trends need history).

### 4) Pourquoi les deals meurent — performance (two cards, side by side)

Two compact horizontal bar charts, top 5 each, last 12 months:
- **Motifs de perte** — counts grouped by `lost_reason` (non-null on closed-lost rows).
- **Motifs de disqualification** — counts grouped by `disqualification_reason` (non-null on disqualified rows).

Each bar labelled with the same translated reason already used in the
disqualify / lost modals (`reasons.<key>.label`, `lost_reasons.<key>.label`).

## Architecture

### Routing & nav

- New route: `src/app/partners/[uuid]/stats/page.tsx`.
- The existing `next.config.ts` rewrite `/:lang(fr|de)/partners/:path*` →
  `/partners/:path*?lang=:lang` already covers `/stats` — no config change.
- `PartnerSidebar` gets a second nav item ("Stats", icon `BarChart3`), and
  `PartnerNav` widens from `"crm"` to `"crm" | "stats"`. Existing `crm`
  link stays as the first item.

### Data flow

```
stats/page.tsx (Server)
  ├─ findPartnerByToken(uuid)
  ├─ fetchPartnerDispatches(partner.id)              ── reused
  ├─ fetchPage("partner-crm", locale)                ── reused (same dict)
  └─ resolveWeights(partner.lead_scoring_weights)    ── reused

      ↓ passes dispatches + dictionary + scoringWeights + lang

PartnerSidebar (Client, activeNav="stats")
  └─ PartnerFilterProvider (already in place)
      └─ <StatsBoard dispatches scoringWeights dictionary lang />
```

`StatsBoard` is a single client component that:
1. Reads `usePartnerFilter()` → `inRange(iso)`.
2. Computes filtered dispatches (`d.dispatched_at` passes `inRange`) inside
   a `useMemo` keyed on the filter + the source array.
3. Derives aggregates (counts, Δ vs previous window, avg score, monthly
   buckets, reason tallies) and passes them to small sub-components.

### Card components (`src/components/partners/stats/`)

One file per card, presentational + chart only. They take pre-computed
props from `StatsBoard`, so they don't re-do aggregation work.

- `KpiTile.tsx` — three variants via props (`label`, `value`, `delta`,
  optional `sparkline: number[]`, optional `bandClass`). Generic enough
  that the three KPI tiles share it.
- `PipelineFunnelCard.tsx` — `recharts` `BarChart` with `layout="vertical"`.
- `MonthlyVolumeCard.tsx` — `BarChart` of 12 monthly buckets.
- `ReasonsBreakdownCard.tsx` — generic top-5 horizontal `BarChart`, used
  twice with different inputs.

### Aggregation helpers

A new pure module `src/lib/dispatch/stats.ts` collects the math so the
client component stays small and the logic is testable:

```ts
// kpis: numbers for one period vs the previous period
function kpisFor(
  cards: PartnerDispatchCard[],
  inRange: (iso: string) => boolean,
  prevRange: (iso: string) => boolean,
  weights: ScoringWeights,
): {
  leads: number; leadsDelta: number;
  closed: number; won: number; conversionPct: number | null;
  avgScore: number | null;
}

// monthly: { yyyymm, count } for the last 12 months (newest right)
function monthlyVolume(cards: PartnerDispatchCard[], now?: Date)

// 6-month avg-score series for the sparkline
function avgScoreByMonth(cards, weights, monthsBack: 6)

// per-stage open count + oldest-in-stage (days) for the funnel
function pipelineStats(cards, mainStages, now?)

// top-N counts of a string field, filtered by a predicate
function topReasons(
  cards,
  field: "lost_reason" | "disqualification_reason",
  predicate: (c) => boolean,
  n: 5,
)
```

`PartnerFilterContext` already exposes `inRange`; for the Δ we add a
sibling helper `previousRange(iso)` that shifts the same window length
backwards. To avoid bloating the context, this is computed in
`StatsBoard` from `filter` rather than added to the provider.

### i18n

New keys on the existing `partner-crm` page `content` (single dictionary
covers both routes — `extractPageDictionary("partner-crm", …)` is what the
stats page loads too):

```
stats.title           = "Statistiques"
stats.kpi.leads       = "Leads"
stats.kpi.delta       = "vs période précédente"
stats.kpi.conversion  = "Taux de conversion"
stats.kpi.avg_quality = "Qualité moyenne"
stats.funnel.title    = "Funnel"
stats.funnel.oldest   = "Plus ancien : il y a {n} j"
stats.monthly.title   = "Volume mensuel"
stats.reasons.lost    = "Motifs de perte"
stats.reasons.disq    = "Motifs de disqualification"
stats.empty           = "Aucun lead dans cette période"
sidebar.nav.stats     = "Statistiques"
```

Bar/line labels (stage names, reason labels, month names) reuse existing
namespaces — no new translation keys for those.

## Reuse / conventions

- `fetchPartnerDispatches` (`partner-dashboard-queries.ts:101`) — same
  500-row fetch the CRM uses; the partner has at most a few hundred leads
  in v1, so client-side aggregation is fine.
- `scoring.scoreLead` + `resolveWeights` — same module the CRM chip uses.
- `PartnerFilterContext` — `inRange` already filters `dispatched_at`.
- `PartnerSidebar` — already a client shell with `activeNav` switching;
  just extend the nav item list.
- Charts: shadcn `chart.tsx` + Recharts `BarChart`, `LineChart`. No new
  dep, no new wrapper.
- Dictionary: `makePartnerT` with `[key]` fallback, same as everywhere on
  the partner pages.

## Out of scope (v1)

- Persisting stats / pre-aggregated tables — computed on the fly.
- Cross-partner / admin overview.
- CSV export.
- Per-canton breakdowns.
- Configurable widgets (drag, hide, re-order).
- Real-time refresh — page revalidates on navigation; live updates can wait.
- German translations (no `de` partner yet).

## Verification

1. `npx tsc --noEmit && npm run lint && npm run build` — clean.
2. Open `/fr/partners/<token>/stats`:
   - Sidebar's "Stats" item is active.
   - All six widgets render with real data; no empty `[key]` placeholders.
   - The Δ on "Leads" matches `current_window - previous_window` by hand.
3. Switch the date filter in the header to "30 derniers jours":
   - KPI tiles and Funnel update; trend charts don't.
4. Navigate back to `/crm` — same sidebar, CRM item active, no console errors.
5. On a partner with `lost_reason="competitor"` x3, "ghosted" x1 → "Motifs
   de perte" shows competitor (3) first, ghosted (1) second.
6. With no leads at all → each card shows the localised empty state.
