"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { StatsCard } from "./StatsCard";
import type { ReasonRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

export function ReasonsBreakdownCard({
  title,
  rows,
  labelNs,
  dictionary,
  fill = "var(--primary)",
  Icon,
}: {
  title: string;
  rows: ReasonRow[];
  /** Dictionary namespace for value labels — "reasons" or "lost_reasons". */
  labelNs: "reasons" | "lost_reasons";
  dictionary: PartnerDict;
  /** Bar fill colour — defaults to primary. Callers pass distinct hues to
   * differentiate lost vs disqualified at a glance. */
  fill?: string;
  /** Heading icon — caller-supplied since the same card is reused for
   * different concepts (lost vs disqualified). */
  Icon?: LucideIcon;
}) {
  const t = makePartnerT(dictionary);
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <StatsCard title={title} Icon={Icon}>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const label = t(`${labelNs}.${r.key}.label`);
            const pct = max > 0 ? (r.count / max) * 100 : 0;
            return (
              <li
                key={r.key}
                className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-3 text-sm"
              >
                <div className="min-w-0">
                  <span className="mb-1.5 block truncate" title={label}>
                    {label}
                  </span>
                <div
                  className="h-2 overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-label={label}
                  aria-valuenow={r.count}
                  aria-valuemin={0}
                  aria-valuemax={max}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${pct}%` : "0%",
                      backgroundColor: fill,
                    }}
                  />
                </div>
                </div>
                <span className="text-right font-semibold tabular-nums">
                  {r.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </StatsCard>
  );
}
