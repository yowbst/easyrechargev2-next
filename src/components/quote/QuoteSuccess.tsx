"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePostHog } from "@/components/PostHogProvider";
import { CheckCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveRouteId, resolveRouteLinks } from "@/lib/pageConfig";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import { matchesShowWhen } from "@/lib/cta-conditions";
import type { Product } from "@/lib/products";

interface QuoteSuccessProps {
  lang: string;
  dictionary: Record<string, string>;
  heroImageUrl?: string;
  ctas: Array<{
    label?: string;
    type?: string;
    variant?: string;
    page_route_id?: string;
    show_when?: unknown;
  }>;
  slaVars: {
    first_contact: number | string;
    quote_delivery_timeline: number | string;
  };
  quoteSlug: string;
  pageRegistry: PageRegistryEntry[];
  product: Product;
  /** Directus pages holding this page's copy, most specific first. */
  dictPageIds: string[];
}

export function QuoteSuccess({
  lang,
  dictionary,
  heroImageUrl,
  ctas,
  slaVars,
  quoteSlug,
  pageRegistry,
  product,
  dictPageIds,
}: QuoteSuccessProps) {
  const searchParams = useSearchParams();
  const [firstName, setFirstName] = useState("");
  const [submissionId, setSubmissionId] = useState("");

  useEffect(() => {
    setFirstName(searchParams.get("firstName") ?? "");
    setSubmissionId(searchParams.get("submissionId") ?? "");
  }, [searchParams]);

  const ph = usePostHog();
  useEffect(() => {
    if (submissionId) {
      ph?.capture("quote_success_viewed", { form_type: "quote", product, locale: lang, submission_id: submissionId });
    }
  }, [ph, submissionId, lang, product]);

  const d = (key: string, vars?: Record<string, string | number>) => {
    let val = "";
    for (const id of dictPageIds) {
      const v = dictionary[`pages.${id}.${key}`];
      if (v) { val = v; break; }
    }
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return val;
  };

  const needsLeadData = ctas.some((c) => c.show_when !== undefined && c.show_when !== null);
  const [leadData, setLeadData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    if (!needsLeadData || !submissionId) return;
    let cancelled = false;
    fetch(`/api/form-submissions/${submissionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        const data = json?.data?.submission?.data;
        if (!cancelled && data && typeof data === "object") setLeadData(data as Record<string, unknown>);
      })
      .catch(() => { /* conditional CTAs stay hidden */ });
    return () => { cancelled = true; };
  }, [needsLeadData, submissionId]);

  // Keep each CTA's original index: its label key is cta.<index>.label.
  const visibleCtas = ctas
    .map((cta, i) => ({ cta, i }))
    .filter(({ cta }) => matchesShowWhen(cta.show_when, leadData));

  const rawTitle = d("blocks.hero.headline", { firstName });
  // No firstName: strip leading punctuation/whitespace, then capitalize
  const title = firstName
    ? rawTitle
    : rawTitle.replace(/^[\s,;:!?]+/, "").replace(/^./, (c) => c.toUpperCase());

  const subtitle = d("blocks.hero.subheadline", {
    first_contact: slaVars.first_contact,
    quote_delivery_timeline: slaVars.quote_delivery_timeline,
  });

  const heroBody = d("blocks.hero.body", {
    first_contact: slaVars.first_contact,
    quote_delivery_timeline: slaVars.quote_delivery_timeline,
    firstName,
  });

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <section className="relative min-h-svh flex items-center">
          <div className="absolute inset-0">
            {heroImageUrl && (
              <img
                src={heroImageUrl}
                alt=""
                width={1920}
                height={1080}
                className="w-full h-full object-cover object-center"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/85 to-slate-900/50" />
          </div>

          <div className="container relative z-10 mx-auto px-4 py-20 md:py-32">
            <div className="max-w-2xl">
              <div className="mb-6 inline-flex items-center justify-center rounded-full bg-primary/20 p-3 backdrop-blur-sm border border-primary/30">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>

              {title && (
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-heading font-bold text-white mb-6 leading-tight">
                  {title}
                </h1>
              )}

              {subtitle && (
                <p className="text-lg text-white/80 mb-6 leading-relaxed">
                  {subtitle}
                </p>
              )}

              {heroBody && (
                <div
                  className="prose prose-sm dark:prose-invert max-w-none prose-p:text-white/70 prose-a:text-primary mb-10"
                  dangerouslySetInnerHTML={{
                    __html: resolveRouteLinks(heroBody, lang, pageRegistry),
                  }}
                />
              )}

              {visibleCtas.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {visibleCtas.map(({ cta, i }) => (
                    <Link
                      key={i}
                      href={(() => {
                        if (
                          cta.page_route_id === "quote-view" &&
                          submissionId
                        ) {
                          return `/${lang}/${quoteSlug}/${submissionId}`;
                        }
                        return (
                          resolveRouteId(
                            cta.page_route_id,
                            lang,
                            pageRegistry,
                          ) || `/${lang}`
                        );
                      })()}
                      className={cn(
                        buttonVariants({
                          size: "lg",
                          variant:
                            cta.variant === "outline" ? "outline" : "default",
                        }),
                        cta.variant === "outline"
                          ? "border-white/40 text-white hover:bg-white/10"
                          : "",
                      )}
                    >
                      {d(
                        `blocks.hero.cta.${i}.label`,
                      ) || cta.label || ""}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
