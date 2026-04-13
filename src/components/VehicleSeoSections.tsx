/**
 * Server Components for vehicle page SEO content sections.
 * Each component is placed at a different point in the vehicle detail page.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle, Zap } from "lucide-react";
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

export function VehicleSeoAdvice({
  title,
  intro,
  items,
  recommendedLabel,
}: {
  title: string;
  intro?: string;
  items: ChargingAdviceItem[];
  recommendedLabel: string;
}) {
  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        <h2 className="text-xl sm:text-2xl font-heading font-bold mb-4">{title}</h2>
        {intro && (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">{intro}</p>
        )}
        <div className="grid gap-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className={`p-3 sm:p-5 transition-colors ${item.recommended ? "border-green-500/50 bg-green-50/30 dark:bg-green-950/15 ring-1 ring-green-500/20" : ""}`}
            >
              <div className="flex flex-col gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Zap className={`h-4 w-4 shrink-0 ${item.recommended ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`} />
                  <span className="font-semibold text-xs sm:text-sm">{item.chargingPoint}</span>
                  <span className="text-xs sm:text-sm tabular-nums text-muted-foreground ml-auto">{item.time}</span>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
                {item.recommended && (
                  <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white text-[10px] sm:text-xs gap-1 px-1.5 sm:px-2 w-fit">
                    <CheckCircle className="h-3 w-3" />
                    {recommendedLabel}
                  </Badge>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Cost Estimate ──────────────────────────────────────────────────────
// Re-exported from client component
export { VehicleSeoCost } from "@/components/VehicleSeoCost";

// ── FAQ ─────────────────────────────────────────────────────────────────

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
    <section className="py-12">
      <div className="container mx-auto px-4">
        <h2 className="text-xl sm:text-2xl font-heading font-bold mb-4">{title}</h2>
        {intro && (
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-8">{intro}</p>
        )}
        <Accordion className="w-full">
          {items.map((item, index) => (
            <AccordionItem key={item.id} value={`item-${index}`}>
              <AccordionTrigger className="text-left hover:no-underline w-full justify-between gap-4 md:gap-8">
                {item.question}
              </AccordionTrigger>
              <AccordionContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </p>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
