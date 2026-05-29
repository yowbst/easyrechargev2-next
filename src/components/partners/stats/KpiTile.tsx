"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";

export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  fraction,
  sparkline,
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  fraction?: string;
  sparkline?: React.ReactNode;
}) {
  const arrow =
    typeof delta === "number"
      ? delta > 0
        ? ArrowUp
        : delta < 0
          ? ArrowDown
          : Minus
      : null;
  const deltaTone =
    typeof delta === "number" && delta !== 0
      ? delta > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-rose-600 dark:text-rose-400"
      : "text-muted-foreground";

  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {(arrow || fraction) && (
        <div className="mt-1 flex items-center gap-2 text-xs">
          {arrow && (
            <span className={`inline-flex items-center gap-0.5 ${deltaTone}`}>
              {(() => {
                const Icon = arrow;
                return <Icon className="h-3 w-3" aria-hidden />;
              })()}
              <span className="tabular-nums">
                {delta! > 0 ? `+${delta}` : delta}
              </span>
              {deltaLabel && <span className="ml-1 text-muted-foreground">{deltaLabel}</span>}
            </span>
          )}
          {fraction && <span className="text-muted-foreground tabular-nums">{fraction}</span>}
        </div>
      )}
      {sparkline && <div className="mt-2 h-8">{sparkline}</div>}
    </Card>
  );
}
