"use client";

import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
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

  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <span>{title}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const label = t(`${labelNs}.${r.key}.label`);
            const pct = max > 0 ? (r.count / max) * 100 : 0;
            return (
              <li
                key={r.key}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 text-xs"
              >
                <span className="truncate" title={label}>
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
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, backgroundColor: fill }}
                  />
                </div>
                <span className="w-6 text-right tabular-nums text-muted-foreground">
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
