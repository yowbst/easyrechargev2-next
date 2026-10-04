/**
 * Server Components for vehicle page SEO content sections.
 * Each component is placed at a different point in the vehicle detail page.
 */

import React from "react";
import { Check, Minus, Plus, Zap } from "lucide-react";
import type {
  ChargingAdviceItem,
  FAQItem,
} from "@/lib/vehicle-content";

// ── Intro ──────────────────────────────────────────────────────────────

export function VehicleSeoIntro({
  title,
  text,
  text2,
  sidebar,
}: {
  title: string;
  text: string;
  text2?: string;
  sidebar?: React.ReactNode;
}) {
  return (
    <section className="pb-8">
      <div className="container mx-auto px-4">
        <div className={sidebar ? "grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8 items-stretch" : ""}>
          <div className="space-y-3">
            <h2 className="text-xl sm:text-2xl font-heading font-bold mb-4">{title}</h2>
            <p className="text-base text-muted-foreground leading-relaxed">
              {text}
            </p>
            {text2 && (
              <p className="text-base text-muted-foreground leading-relaxed">
                {text2}
              </p>
            )}
          </div>
          {sidebar && (
            <div className="flex flex-col h-full">
              {sidebar}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Charging Advice ────────────────────────────────────────────────────

/**
 * Charging time per charging point, in the language of the home page's
 * "Quelle puissance" block (design 14 Véhicules — 14b): one card per point,
 * the time large, the recommended one framed in Charge.
 */
export function VehicleSeoAdvice({
  title,
  intro,
  items,
  recommendedLabel,
  eyebrow,
  aside,
}: {
  title: string;
  intro?: string;
  items: ChargingAdviceItem[];
  recommendedLabel: string;
  eyebrow?: string;
  /** e.g. the vehicle's max AC power, shown at the right of the header. */
  aside?: React.ReactNode;
}) {
  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
        <div className="rounded-xl bg-b-sand p-5 md:p-11">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 md:mb-8">
            <div className="max-w-[40rem]">
              {eyebrow && <p className="type-label mb-4 tracking-[0.12em] text-muted-foreground">{eyebrow}</p>}
              <h2 className="mb-3 font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{title}</h2>
              {intro && <p className="text-[17px] leading-relaxed text-muted-foreground">{intro}</p>}
            </div>
            {aside && <div className="text-[15px] text-muted-foreground">{aside}</div>}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-6">
            {items.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border-2 p-4 md:p-7 ${item.recommended ? "border-b-charge bg-card" : "border-transparent bg-b-paper"}`}
              >
                <div className="mb-3 hidden min-h-6.5 md:block">
                  {item.recommended && <RecommendedTag label={recommendedLabel} />}
                </div>
                <div className="flex items-start justify-between gap-3 md:mb-5.5 md:block">
                  <div className="flex items-start gap-2 text-[15px] font-semibold leading-snug">
                    <Zap className="mt-0.5 size-4 shrink-0 text-b-link" aria-hidden />
                    <span className="min-w-0">{item.chargingPoint}</span>
                  </div>
                  <div className="whitespace-nowrap font-heading text-[22px] font-semibold leading-none tracking-[-0.03em] md:hidden">{item.time}</div>
                </div>
                <div className="mb-4 hidden font-heading text-[44px] font-semibold leading-none tracking-[-0.04em] md:block">{item.time}</div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground md:mt-0 md:text-[15px]">{item.description}</p>
                {item.recommended && (
                  <div className="mt-2.5 md:hidden">
                    <RecommendedTag label={recommendedLabel} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RecommendedTag({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6.5 items-center gap-1.5 rounded-md bg-b-charge px-2.5 text-[13px] font-semibold text-b-on-charge">
      <Check className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

// ── Cost Estimate ──────────────────────────────────────────────────────
// Re-exported from client component
export { VehicleSeoCost } from "@/components/VehicleSeoCost";

// ── FAQ ─────────────────────────────────────────────────────────────────

/** FAQ as native disclosures — answers stay in the DOM for the FAQPage schema. */
export function VehicleSeoFAQ({
  title,
  intro,
  items,
}: {
  title: string;
  intro?: string;
  items: FAQItem[];
}) {
  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
        <div className="max-w-[860px]">
          <h2 className="mb-3 font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{title}</h2>
          {intro && <p className="mb-6 text-[17px] leading-relaxed text-muted-foreground">{intro}</p>}
          <div className="border-t">
            {items.map((item, index) => (
              <details key={item.id} open={index === 0} className="group border-b">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-4 py-3.5 text-[17px] font-semibold leading-snug [&::-webkit-details-marker]:hidden">
                  <span className="flex-1">{item.question}</span>
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-b-sand group-open:bg-b-forest group-open:text-b-on-forest">
                    <Plus className="size-4 group-open:hidden" aria-hidden />
                    <Minus className="hidden size-4 group-open:block" aria-hidden />
                  </span>
                </summary>
                <p className="pb-5 text-base leading-[1.65] text-muted-foreground md:pr-12">{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
