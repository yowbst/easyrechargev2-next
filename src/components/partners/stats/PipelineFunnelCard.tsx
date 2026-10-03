"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { StatsCard } from "./StatsCard";
import type { FunnelRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

// Progressive primary tint per stage — darkest at the success terminal.
const STAGE_OPACITY = [0.4, 0.55, 0.7, 0.85, 1] as const;

export function PipelineFunnelCard({
  rows,
  dictionary,
}: {
  rows: FunnelRow[];
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const max = rows.reduce((m, r) => (r.count > m ? r.count : m), 0);
  const empty = max === 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <StatsCard title={t("stats.funnel.title")} Icon={ListChecks}>
      {empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <ul>
          {rows.map((r, i) => {
            const width = max > 0 ? (r.count / max) * 100 : 0;
            const oldestSuffix =
              r.oldestDays !== null && r.oldestDays > 0
                ? ` · ${t("stats.funnel.oldest", { n: r.oldestDays })}`
                : "";
            return (
              <li
                key={r.stage}
                className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_2.5rem] items-center gap-3.5 border-t border-dotted py-2.5 first:border-t-0 first:pt-0"
                title={`${t(`stages.${r.stage}`)} · ${r.count}${oldestSuffix}`}
              >
                <span className="truncate text-sm font-medium text-foreground">
                  {t(`stages.${r.stage}`)}
                </span>
                <div className="relative h-[22px]">
                  <div
                    className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-sm transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${width}%` : "0%",
                      backgroundColor: "var(--primary)",
                      opacity: STAGE_OPACITY[i] ?? 1,
                    }}
                  />
                </div>
                <span className="text-right text-sm font-semibold tabular-nums">
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
