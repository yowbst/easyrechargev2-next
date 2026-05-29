"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { FunnelRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

const BAR_COLOR = "hsl(var(--primary))";

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
    count: r.count,
    oldestDays: r.oldestDays,
  }));
  const empty = rows.every((r) => r.count === 0);
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{t("stats.funnel.title")}</h3>
      {empty ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="stage"
                width={110}
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                cursor={{ fill: "transparent" }}
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
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={BAR_COLOR} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
