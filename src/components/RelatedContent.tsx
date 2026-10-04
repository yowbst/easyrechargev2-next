"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getRouteSlug } from "@/lib/i18n/config";
import { formatChargeTime } from "@/components/VehicleCard";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { TransformedBlogPost } from "@/lib/blog/transform";
import { interpolate } from "@/lib/i18n/vehicle-content-strings";

interface RelatedContentProps {
  sameBrand: Vehicle[];
  similar: Vehicle[];
  featuredPosts: TransformedBlogPost[];
  lang: string;
  pageRegistry: PageRegistryEntry[];
  strings: {
    sectionTitle: string;
    sameBrand: string;
    similar: string;
    featuredPosts: string;
    /** Short stat labels for the reduced cards. */
    range?: string;
    homeCharging?: string;
  };
  brandName: string;
  modelName: string;
}

/**
 * Internal linking at the foot of a vehicle page (design 14 Véhicules — 14d):
 * reduced vehicle cards with "same brand" / "similar" tabs, then featured
 * guides. Both vehicle lists stay in the DOM (the inactive one is `hidden`),
 * so every link remains crawlable.
 */
export function RelatedContent({
  sameBrand,
  similar,
  featuredPosts,
  lang,
  pageRegistry,
  strings,
  brandName,
  modelName,
}: RelatedContentProps) {
  const tabs = [
    { id: "brand", label: interpolate(strings.sameBrand, { brand: brandName }), items: sameBrand },
    { id: "similar", label: strings.similar, items: similar },
  ].filter((t) => t.items.length > 0);
  const [active, setActive] = useState(tabs[0]?.id);

  if (tabs.length === 0 && featuredPosts.length === 0) return null;

  const vehiclesPath = getRouteSlug(lang, "vehicles");
  const blogSlug = pageRegistry.find((p) => p.id === "blog")?.slugs[lang] || "blog";
  const sectionTitle = interpolate(strings.sectionTitle, { brand: brandName, model: modelName });

  return (
    <section className="py-14 md:py-20">
      <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <h2 className="font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{sectionTitle}</h2>
          {tabs.length > 1 && (
            <div role="tablist" className="inline-flex gap-1 rounded-lg bg-b-sand p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`related-tab-${t.id}`}
                  aria-selected={active === t.id}
                  aria-controls={`related-panel-${t.id}`}
                  onClick={() => setActive(t.id)}
                  className={`h-10 rounded-md px-4 text-sm font-semibold ${active === t.id ? "bg-card text-foreground shadow-[0_1px_2px_rgba(7,35,26,.12)]" : "text-muted-foreground"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {tabs.map((t) => (
          <div
            key={t.id}
            role={tabs.length > 1 ? "tabpanel" : undefined}
            id={`related-panel-${t.id}`}
            aria-labelledby={tabs.length > 1 ? `related-tab-${t.id}` : undefined}
            hidden={active !== t.id}
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3"
          >
            {t.items.map((v) => {
              const time = formatChargeTime(v.charging?.home_destination?.charge_time);
              return (
                <Link
                  key={v.id}
                  href={`/${lang}/${vehiclesPath}/${v.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl border bg-card text-foreground transition-shadow hover:shadow-[0_12px_32px_-16px_rgba(7,35,26,.35)]"
                >
                  <div className="relative aspect-video bg-b-inset">
                    {v.image && (
                      <Image src={v.image} alt="" fill quality={60} loading="lazy" sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 380px" className="object-cover" />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{v.brand}</div>
                    <div className="mb-3 font-heading text-[22px] font-semibold leading-[1.15] tracking-[-0.03em]">{v.model}</div>
                    <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                      <div className="flex gap-1.5">
                        <dd className="font-semibold text-foreground">{v.rangeDisplay}</dd>
                        {strings.range && <dt>{strings.range.toLowerCase()}</dt>}
                      </div>
                      {time && (
                        <div className="flex gap-1.5">
                          <dd className="font-semibold text-foreground">{time}</dd>
                          {strings.homeCharging && <dt>{strings.homeCharging.toLowerCase()}</dt>}
                        </div>
                      )}
                    </dl>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

        {featuredPosts.length > 0 && (
          <div className="mt-12">
            <h3 className="type-label mb-3 tracking-widest text-muted-foreground">{strings.featuredPosts}</h3>
            <ul className="grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {featuredPosts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/${lang}/${blogSlug}/${post.categorySlug}/${post.slug}`}
                    className="flex min-h-11 items-center justify-between gap-3 border-b py-2.5 text-[15px] font-medium hover:text-b-link"
                  >
                    {post.title}
                    <ArrowRight className="size-4 shrink-0 text-b-link" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
