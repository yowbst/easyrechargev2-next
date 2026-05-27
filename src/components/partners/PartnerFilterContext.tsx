"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DatePreset = "all" | "7d" | "30d" | "90d" | "month" | "custom";

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

  const value = useMemo<FilterContextValue>(() => {
    const { active, inRange } = buildBounds(filter);
    return { filter, setFilter, active, inRange };
  }, [filter]);

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
