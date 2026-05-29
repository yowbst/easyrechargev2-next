"use client";

import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
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
    <Card className="p-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-500">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{t("stats.funnel.title")}</span>
      </h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-dotted divide-border">
          {rows.map((r, i) => {
            const width = max > 0 ? (r.count / max) * 100 : 0;
            const oldestSuffix =
              r.oldestDays !== null && r.oldestDays > 0
                ? ` · ${t("stats.funnel.oldest", { n: r.oldestDays })}`
                : "";
            return (
              <li
                key={r.stage}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-3 py-2.5"
                title={`${t(`stages.${r.stage}`)} · ${r.count}${oldestSuffix}`}
              >
                <span className="truncate text-xs font-medium text-foreground">
                  {t(`stages.${r.stage}`)}
                </span>
                <div className="relative h-5">
                  <div
                    className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-sm transition-[width] duration-700 ease-out"
                    style={{
                      width: mounted ? `${width}%` : "0%",
                      backgroundColor: "var(--primary)",
                      opacity: STAGE_OPACITY[i] ?? 1,
                    }}
                  />
                </div>
                <span className="w-8 text-right text-xs font-semibold tabular-nums">
                  {r.count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
