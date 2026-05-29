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
      <h3 className="mb-2 text-sm font-semibold">{t("stats.monthly.title")}</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
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
                  fill={b.current ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.3)"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
