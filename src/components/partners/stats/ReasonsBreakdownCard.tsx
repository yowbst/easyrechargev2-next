"use client";

import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { ReasonRow } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

export function ReasonsBreakdownCard({
  title,
  rows,
  labelNs,
  dictionary,
}: {
  title: string;
  rows: ReasonRow[];
  /** Dictionary namespace for value labels — "reasons" or "lost_reasons". */
  labelNs: "reasons" | "lost_reasons";
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  const data = rows.map((r) => ({
    label: t(`${labelNs}.${r.key}.label`),
    count: r.count,
  }));
  return (
    <Card className="p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("stats.empty")}
        </p>
      ) : (
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" hide allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={140}
                tick={{ fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <RechartsTooltip
                cursor={{ fill: "transparent" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0].payload as { label: string; count: number };
                  return (
                    <div className="rounded border bg-popover px-2 py-1 text-xs shadow-md">
                      {r.label} : {r.count}
                    </div>
                  );
                }}
              />
              <Bar dataKey="count" radius={[0, 3, 3, 0]} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
