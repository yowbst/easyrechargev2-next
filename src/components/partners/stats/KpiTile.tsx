"use client";

import { ArrowDown, ArrowUp, Minus, type LucideIcon } from "lucide-react";

export function KpiTile({
  label,
  value,
  delta,
  deltaLabel,
  fraction,
  sparkline,
  Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  fraction?: string;
  sparkline?: React.ReactNode;
  Icon?: LucideIcon;
  /** "inverted" paints the tile in the sidebar's forest green — used for the
   *  one figure on the Performance tab that is money out, not a result. */
  tone?: "default" | "inverted";
}) {
  const arrow =
    typeof delta === "number"
      ? delta > 0
        ? ArrowUp
        : delta < 0
          ? ArrowDown
          : Minus
      : null;
  const inverted = tone === "inverted";
  const deltaTone =
    typeof delta === "number" && delta !== 0
      ? delta > 0
        ? "text-partner-won"
        : "text-partner-lost"
      : "text-muted-foreground";

  return (
    <div
      className={`rounded-xl px-6 py-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${
        inverted
          ? "bg-sidebar text-sidebar-foreground"
          : "border bg-card text-card-foreground"
      }`}
    >
      {/* min-w-0 + truncate: these labels are Directus-authored and a long
          German translation would otherwise run out of the tile. */}
      <p
        className={`flex min-w-0 items-center gap-2 text-sm font-semibold ${
          inverted ? "text-sidebar-foreground/65" : "text-muted-foreground"
        }`}
        title={label}
      >
        {Icon && <Icon className="size-[15px] shrink-0" aria-hidden />}
        <span className="truncate">{label}</span>
      </p>
      <div className="mt-3.5 flex items-end justify-between gap-4">
        {/* Instrument Sans at display size with tight tracking — the figure is
            the point of the tile, so it gets the whole visual budget. */}
        <p
          className={`font-heading font-semibold leading-none tracking-[-0.04em] tabular-nums ${
            inverted ? "text-4xl" : "text-[2.75rem]"
          }`}
        >
          {value}
        </p>
        {sparkline && <div className="h-10 w-36 shrink-0">{sparkline}</div>}
      </div>
      {(arrow || fraction) && (
        <div className="mt-3 flex items-center gap-1.5 text-sm">
          {arrow && (
            <span className={`inline-flex items-center gap-1 font-semibold ${deltaTone}`}>
              {(() => {
                const DeltaIcon = arrow;
                return <DeltaIcon className="size-3.5" aria-hidden />;
              })()}
              <span className="tabular-nums">
                {delta! > 0 ? `+${delta}` : delta}
              </span>
            </span>
          )}
          {arrow && deltaLabel && (
            <span className="text-muted-foreground">{deltaLabel}</span>
          )}
          {fraction && (
            <span className="tabular-nums text-muted-foreground">{fraction}</span>
          )}
        </div>
      )}
    </div>
  );
}
