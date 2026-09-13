"use client";

import type { LucideIcon } from "lucide-react";

/**
 * The panel every stats chart sits in. A local shell rather than `ui/card`
 * because Direction B's stats surfaces have their own padding, radius and
 * heading scale, and threading four overrides through Card on every call site
 * says less than one component does.
 */
export function StatsCard({
  title,
  Icon,
  children,
  className = "",
}: {
  title: string;
  Icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border bg-card px-6 py-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ${className}`}
    >
      <h3 className="mb-4 flex items-center gap-2 text-[17px] font-semibold">
        {Icon && (
          <Icon className="size-[17px] shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span>{title}</span>
      </h3>
      {children}
    </section>
  );
}
