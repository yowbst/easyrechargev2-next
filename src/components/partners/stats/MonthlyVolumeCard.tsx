"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { StatsCard } from "./StatsCard";
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
    <StatsCard title={t("stats.monthly.title")} Icon={BarChart3}>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          {/* No Y axis: each bar is labelled with its own count, which reads
              faster than a gridline lookup and gives the chart its full height. */}
          <BarChart data={series} margin={{ top: 20, right: 4, bottom: 0, left: 4 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <RechartsTooltip
              cursor={{ fill: "transparent" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as MonthlyBucket;
                return (
                  <div className="rounded-md border bg-popover px-2.5 py-1.5 text-sm shadow-md">
                    {r.label} : {r.count}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="count"
              radius={[6, 6, 0, 0]}
              // The grow-in animation buys nothing on a six-bar dashboard tile
              // and leaves the chart (and its value labels) in a half-drawn
              // state for its duration.
              isAnimationActive={false}
              // Value on the bar rather than a Y axis: one number per column
              // reads faster than a gridline lookup, and the chart keeps its
              // full height. `label` (not <LabelList>) because Bar already has
              // <Cell> children here.
              label={{
                position: "top",
                offset: 8,
                fill: "var(--foreground)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {series.map((b, i) => (
                <Cell
                  key={i}
                  // The running month is the one the partner is acting on;
                  // the rest are context, in the ink colour rather than green.
                  fill={b.current ? "var(--chart-1)" : "var(--sidebar)"}
                  fillOpacity={b.current ? 1 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </StatsCard>
  );
}
