"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isLeadVisible, type ScoringWeights } from "@/lib/partner-facets";
import type { PartnerDispatchCard } from "@/lib/dispatch/partner-dashboard-queries";
import {
  DEFAULT_FILTER_STATE,
  EMPTY_FACETS,
  serialiseFilterParams,
  type DateFilter,
  type DatePreset,
  type FacetGroup,
  type Facets,
  type FilterState,
  type SortKey,
} from "@/lib/partner-filter-params";

export type { DateFilter, DatePreset, FacetGroup, Facets, SortKey };

interface FilterContextValue {
  filter: DateFilter;
  setFilter: (f: DateFilter) => void;
  /** True when the filter is narrowing results (i.e. not "all"). */
  active: boolean;
  /** Whether a lead's creation timestamp falls inside the active window. */
  inRange: (iso: string) => boolean;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  facets: Facets;
  toggleFacet: (group: FacetGroup, value: string) => void;
  clearFacets: () => void;
  /** Total number of selected facet values across all groups. */
  facetCount: number;
  /** True when anything is narrowing the list — a date window or any facet. */
  filtering: boolean;
  /**
   * How many leads pass the current filter, and how many exist in total.
   * `visible` is null when the provider was given no leads to count (the
   * stats and invoices views), so the header can fall back to its own number.
   */
  visible: number | null;
  total: number | null;
}

// Module-scoped so the Date.now() call stays out of the render path (the
// React compiler flags impure calls made directly during render).
function buildBounds(filter: DateFilter): {
  active: boolean;
  inRange: (iso: string) => boolean;
} {
  const now = Date.now();
  const DAY = 86_400_000;
  let lower: number | null = null;
  let upper: number | null = null;
  if (filter.preset === "7d") lower = now - 7 * DAY;
  else if (filter.preset === "30d") lower = now - 30 * DAY;
  else if (filter.preset === "90d") lower = now - 90 * DAY;
  else if (filter.preset === "month" && filter.month) {
    const [y, m] = filter.month.split("-").map(Number);
    lower = new Date(y, m - 1, 1, 0, 0, 0).getTime();
    upper = new Date(y, m, 0, 23, 59, 59).getTime(); // day 0 of next month
  } else if (filter.preset === "custom") {
    if (filter.from) lower = new Date(`${filter.from}T00:00:00`).getTime();
    if (filter.to) upper = new Date(`${filter.to}T23:59:59`).getTime();
  }
  const active =
    filter.preset !== "all" &&
    (filter.preset === "custom" || filter.preset === "month"
      ? lower !== null || upper !== null
      : true);
  return {
    active,
    inRange: (iso: string) => {
      const ts = new Date(iso).getTime();
      if (lower !== null && ts < lower) return false;
      if (upper !== null && ts > upper) return false;
      return true;
    },
  };
}

const PartnerFilterContext = createContext<FilterContextValue | null>(null);

export function PartnerFilterProvider({
  children,
  dispatches,
  scoringWeights,
  initial = DEFAULT_FILTER_STATE,
}: {
  children: ReactNode;
  /** Given on the Leads view so the header can count what passes the filter. */
  dispatches?: PartnerDispatchCard[];
  scoringWeights?: ScoringWeights;
  /** Parsed by the page from `searchParams`. */
  initial?: FilterState;
}) {
  // Seeded by the server from the incoming query string, so the first client
  // render matches the HTML and a shared link is filtered from the first paint.
  const [filter, setFilter] = useState<DateFilter>(initial.filter);
  const [sort, setSort] = useState<SortKey>(initial.sort);
  const [facets, setFacets] = useState<Facets>(initial.facets);

  // Mirror state back into the URL so the address bar is always copy-pasteable.
  // replaceState, not push: changing a filter is not a navigation step, and
  // filling the back button with them would trap the partner.
  useEffect(() => {
    const qs = serialiseFilterParams(window.location.search, { filter, sort, facets });
    const next = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [filter, sort, facets]);

  const toggleFacet = useCallback((group: FacetGroup, value: string) => {
    setFacets((prev) => {
      const current = prev[group];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [group]: next };
    });
  }, []);
  const clearFacets = useCallback(() => setFacets(EMPTY_FACETS), []);

  const value = useMemo<FilterContextValue>(() => {
    const { active, inRange } = buildBounds(filter);
    const facetCount =
      facets.housing.length +
      facets.deadline.length +
      facets.approval.length +
      facets.score.length;
    const filtering = active || facetCount > 0;
    const total = dispatches ? dispatches.length : null;
    const visible =
      dispatches && scoringWeights
        ? dispatches.filter((d) => isLeadVisible(d, inRange, facets, scoringWeights)).length
        : total;
    return {
      filter,
      setFilter,
      active,
      inRange,
      sort,
      setSort,
      facets,
      toggleFacet,
      clearFacets,
      facetCount,
      filtering,
      visible,
      total,
    };
  }, [filter, sort, facets, toggleFacet, clearFacets, dispatches, scoringWeights]);

  return (
    <PartnerFilterContext.Provider value={value}>
      {children}
    </PartnerFilterContext.Provider>
  );
}

export function usePartnerFilter(): FilterContextValue {
  const ctx = useContext(PartnerFilterContext);
  if (!ctx) {
    throw new Error("usePartnerFilter must be used within PartnerFilterProvider");
  }
  return ctx;
}
