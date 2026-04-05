"use client";

import { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePostHog } from "@/components/PostHogProvider";
import { CheckCircle } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveRouteId, resolveRouteLinks } from "@/lib/pageConfig";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface QuoteSuccessProps {
  lang: string;
  dictionary: Record<string, string>;
  heroImageUrl?: string;
  ctas: Array<{
    label?: string;
    type?: string;
    variant?: string;
    page_route_id?: string;
  }>;
  slaVars: {
    first_contact: number | string;
    quote_delivery_timeline: number | string;
  };
  quoteSlug: string;
  pageRegistry: PageRegistryEntry[];
}

export function QuoteSuccess({
  lang,
  dictionary,
  heroImageUrl,
  ctas,
  slaVars,
  quoteSlug,
  pageRegistry,
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
      ph?.capture("quote_success_viewed", { submission_id: submissionId });
    }
  }, [ph, submissionId]);

  const d = (key: string, vars?: Record<string, string | number>) => {
    let val = dictionary[key] ?? "";
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        val = val.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return val;
  };

  const title = useMemo(() => {
    const raw = d("pages.quote-success.blocks.hero.headline", { firstName });
    if (firstName) return raw;
    // No firstName: strip leading punctuation/whitespace, then capitalize
    return raw
      .replace(/^[\s,;:!?]+/, "")
      .replace(/^./, (c) => c.toUpperCase());
  }, [dictionary, firstName]);

  const subtitle = d("pages.quote-success.blocks.hero.subheadline", {
    first_contact: slaVars.first_contact,
    quote_delivery_timeline: slaVars.quote_delivery_timeline,
  });

  const heroBody = d("pages.quote-success.blocks.hero.body", {
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

              {ctas.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {ctas.map((cta, i) => (
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
                        `pages.quote-success.blocks.hero.cta.${i}.label`,
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
