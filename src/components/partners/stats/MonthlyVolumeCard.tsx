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
import { BarChart3 } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MonthlyBucket } from "@/lib/dispatch/stats";
import { makePartnerT, type PartnerDict } from "@/lib/partner-i18n";

export function MonthlyVolumeCard({
  series,
  dictionary,
}: {
  series: MonthlyBucket[];
  dictionary: PartnerDict;
}) {
  const t = makePartnerT(dictionary);
  return (
    <Card className="p-4">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <BarChart3 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <span>{t("stats.monthly.title")}</span>
      </h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 4, left: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            <RechartsTooltip
              cursor={{ fill: "transparent" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as MonthlyBucket;
                return (
                  <div className="rounded border bg-popover px-2 py-1 text-xs shadow-md">
                    {r.label} : {r.count}
                  </div>
                );
              }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]}>
              {series.map((b, i) => (
                <Cell
                  key={i}
                  fill={b.current ? "var(--primary)" : "var(--muted-foreground)"}
                  fillOpacity={b.current ? 1 : 0.35}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
