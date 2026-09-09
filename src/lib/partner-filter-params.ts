/**
 * Filter state for the partner section, and its query-string encoding.
 *
 * Deliberately framework-free (no "use client"): the leads and stats pages are
 * Server Components and parse the incoming `searchParams` themselves, then hand
 * the result to the client provider as props. Reading the URL on the client
 * instead would make the first paint disagree with the server's HTML, and a
 * shared link would render unfiltered for a moment before snapping.
 */

export type DatePreset = "all" | "7d" | "30d" | "90d" | "month" | "custom";

export type SortKey = "recent" | "oldest" | "name" | "stage_age" | "score";

/** Multi-select facet filters on lead attributes. Empty array = no filter. */
export interface Facets {
  housing: string[];
  deadline: string[];
  approval: string[];
  /** Score band values: "hot" | "warm" | "cold". */
  score: string[];
}

export type FacetGroup = keyof Facets;

export interface DateFilter {
  preset: DatePreset;
  /** yyyy-mm-dd, only used when preset === "custom". */
  from: string | null;
  to: string | null;
  /** yyyy-mm, only used when preset === "month" (a billing cycle). */
  month: string | null;
}

export const EMPTY_FACETS: Facets = { housing: [], deadline: [], approval: [], score: [] };

export const DEFAULT_FILTER: DateFilter = { preset: "all", from: null, to: null, month: null };

export const FACET_GROUPS: FacetGroup[] = ["housing", "deadline", "approval", "score"];

const SORT_KEYS: SortKey[] = ["recent", "oldest", "name", "stage_age", "score"];
const DATE_PRESETS: DatePreset[] = ["all", "7d", "30d", "90d", "month", "custom"];

export interface FilterState {
  filter: DateFilter;
  sort: SortKey;
  facets: Facets;
}

export const DEFAULT_FILTER_STATE: FilterState = {
  filter: DEFAULT_FILTER,
  sort: "recent",
  facets: EMPTY_FACETS,
};

function one(v: string | string[] | undefined): string | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Filter state from a Next.js `searchParams` object. Unknown or malformed
 * values fall back to the default rather than throwing — a hand-edited link
 * should degrade to the unfiltered view, not to an error page.
 */
export function parseFilterParams(
  params: Record<string, string | string[] | undefined>,
): FilterState {
  const preset = one(params.period);
  const sortParam = one(params.sort);
  const facets: Facets = { ...EMPTY_FACETS };
  for (const g of FACET_GROUPS) {
    const raw = one(params[g]);
    facets[g] = raw ? raw.split(",").map((x) => x.trim()).filter(Boolean) : [];
  }
  return {
    filter: {
      preset: DATE_PRESETS.includes(preset as DatePreset) ? (preset as DatePreset) : "all",
      from: one(params.from),
      to: one(params.to),
      month: one(params.month),
    },
    sort: SORT_KEYS.includes(sortParam as SortKey) ? (sortParam as SortKey) : "recent",
    facets,
  };
}

/**
 * Mirror state back into a query string, preserving params we do not own
 * (`lang`, `tab`, `invoice`…). Defaults are omitted, so a link carries only
 * what was actually chosen.
 */
export function serialiseFilterParams(current: string, state: FilterState): string {
  const p = new URLSearchParams(current);
  const set = (k: string, v: string | null | undefined) => (v ? p.set(k, v) : p.delete(k));
  const { filter, sort, facets } = state;

  set("period", filter.preset === "all" ? null : filter.preset);
  set("from", filter.preset === "custom" ? filter.from : null);
  set("to", filter.preset === "custom" ? filter.to : null);
  set("month", filter.preset === "month" ? filter.month : null);
  set("sort", sort === "recent" ? null : sort);
  for (const g of FACET_GROUPS) {
    set(g, facets[g].length > 0 ? facets[g].join(",") : null);
  }
  return p.toString();
}
