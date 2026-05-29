"use client";

import {
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
} from "recharts";
import { ListChecks } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { FunnelRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

// Progressive primary tint per stage — read top→bottom as the lead narrows.
// The CSS vars hold full `hsl(...)` values, so we reference them directly
// (wrapping in another `hsl(...)` would be invalid CSS).
const STAGE_OPACITY = [0.45, 0.65, 0.85, 1] as const;

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
    // Recharts Funnel uses `value` to size each trapezoid. We bump zero-count
    // stages to a tiny non-zero so the segment stays visible (otherwise the
    // funnel collapses and the label hangs in space).
    value: r.count > 0 ? r.count : 0.001,
    count: r.count,
    oldestDays: r.oldestDays,
  }));
  const empty = rows.every((r) => r.count === 0);
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{t("stats.funnel.title")}</span>
      </h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <FunnelChart margin={{ top: 4, right: 96, bottom: 4, left: 4 }}>
              <RechartsTooltip
                cursor={false}
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
              <Funnel
                dataKey="value"
                data={data}
                isAnimationActive={false}
                stroke="var(--background)"
              >
                {data.map((_, i) => (
                  <Cell
                    key={i}
                    fill="var(--primary)"
                    fillOpacity={STAGE_OPACITY[i] ?? 1}
                  />
                ))}
                <LabelList
                  position="right"
                  fill="currentColor"
                  stroke="none"
                  dataKey="stage"
                  className="fill-foreground text-xs"
                />
                <LabelList
                  position="center"
                  fill="white"
                  stroke="none"
                  dataKey="count"
                  className="text-xs font-semibold"
                />
              </Funnel>
            </FunnelChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
