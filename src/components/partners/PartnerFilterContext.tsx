"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DatePreset = "all" | "7d" | "30d" | "90d" | "month" | "custom";

export type SortKey = "recent" | "oldest" | "name" | "stage_age";

/** Multi-select facet filters on lead attributes. Empty array = no filter. */
export interface Facets {
  housing: string[];
  deadline: string[];
  approval: string[];
}

export type FacetGroup = keyof Facets;

const EMPTY_FACETS: Facets = { housing: [], deadline: [], approval: [] };

export interface DateFilter {
  preset: DatePreset;
  /** yyyy-mm-dd, only used when preset === "custom". */
  from: string | null;
  to: string | null;
  /** yyyy-mm, only used when preset === "month" (a billing cycle). */
  month: string | null;
}

const DEFAULT_FILTER: DateFilter = {
  preset: "all",
  from: null,
  to: null,
  month: null,
};

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

export function PartnerFilterProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState<DateFilter>(DEFAULT_FILTER);
  const [sort, setSort] = useState<SortKey>("recent");
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);

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
      facets.housing.length + facets.deadline.length + facets.approval.length;
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
    };
  }, [filter, sort, facets, toggleFacet, clearFacets]);

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
