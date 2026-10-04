"use client";

import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import type { StepProps } from "./types";

const TIME_KEYS = ["last", "under1", "1min", "1min30", "2min"] as const;

/** "env. 2 min" … "dernière étape", from the number of steps still ahead. */
export function timeLeftKey(index: number, total: number): string {
  const ahead = Math.max(0, total - index - 1);
  return `quote.progress.time.${TIME_KEYS[Math.min(ahead, TIME_KEYS.length - 1)]}`;
}

function Bars({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex w-full gap-1" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`block h-1.5 flex-1 rounded-md ${i < index ? "bg-b-charge" : i === index ? "bg-b-forest dark:bg-b-on-forest" : "bg-border"}`}
        />
      ))}
    </div>
  );
}

function Logo({ src, darkSrc, className }: { src?: string; darkSrc?: string; className: string }) {
  // Not a link: the funnel has no exit (design 15 v2). The draft is kept.
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src || "/logo-color.svg"} alt="easyRecharge" className={`${className} w-auto dark:hidden`} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={darkSrc || "/logo-white.svg"} alt="easyRecharge" className={`${className} hidden w-auto dark:block`} />
    </>
  );
}

/**
 * Focused header of the quote funnels (design 15 v2 / 09 9g): logo, progress
 * with the time left, and the hosting reassurance. No navigation, no exit.
 * Below 1024 px, where the side panel is gone, a Forest strip carries its main promise.
 */
export function QuoteHeader({ tc, index, total, logoSrc, logoDarkSrc, mobileLine }: {
  tc: StepProps["tc"];
  index: number;
  total: number;
  logoSrc?: string;
  logoDarkSrc?: string;
  mobileLine: { icon: LucideIcon; text: string };
}) {
  const time = tc(timeLeftKey(index, total));
  const stepOf = tc("quote.progress.stepOf", { n: index + 1, total });
  const MobileIcon = mobileLine.icon;

  return (
    <header className="border-b border-border bg-b-paper">
      {/* Desktop */}
      <div className="mx-auto hidden h-16 max-w-310 grid-cols-[1fr_auto_1fr] items-center gap-6 px-10 md:grid">
        <Logo src={logoSrc} darkSrc={logoDarkSrc} className="h-9" />
        <div className="flex min-w-90 flex-col items-center gap-2">
          <Bars index={index} total={total} />
          <span className="text-[13px] leading-none font-medium text-muted-foreground" aria-live="polite">
            {stepOf} · {time}
          </span>
        </div>
        <span className="inline-flex items-center gap-2 justify-self-end text-[13px] font-medium text-muted-foreground">
          <Lock className="size-[15px] text-b-link" aria-hidden />
          {tc("quote.header.trust")}
        </span>
      </div>

      {/* Mobile */}
      <div className="flex flex-col gap-2.5 px-5 pt-3 pb-2.5 md:hidden">
        <div className="flex items-center justify-between">
          <Logo src={logoSrc} darkSrc={logoDarkSrc} className="h-7" />
          <span className="text-[13px] font-medium text-muted-foreground" aria-live="polite">
            <span className="sr-only">{stepOf} · </span>
            <span aria-hidden>{index + 1} / {total} · </span>
            {time}
          </span>
        </div>
        <Bars index={index} total={total} />
      </div>
      <div className="flex items-center gap-2.5 bg-b-forest px-5 py-2.5 text-sm text-b-on-forest lg:hidden">
        <MobileIcon className="size-4 shrink-0 text-b-signal" aria-hidden />
        <span className="min-w-0 truncate">{mobileLine.text}</span>
      </div>
    </header>
  );
}
