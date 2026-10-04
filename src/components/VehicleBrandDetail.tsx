"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { VehicleFilters } from "@/components/VehicleFilters";
import { VehicleGrid } from "@/components/VehicleGrid";
import { Container } from "@/components/home-b/Shell";
import { CtaB } from "@/components/home-b/CtaB";
import { opt } from "@/components/home-b/content";
import { useVehicleFilters } from "@/hooks/useVehicleFilters";
import { BrandIcon } from "@/lib/vehicles/shared";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface VehicleBrandDetailProps {
  brandName: string;
  brandSlug: string;
  vehicles: Vehicle[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  heroIcon?: string;
  heroIconSvg?: string | null;
  heroImage?: string;
  getQuoteBlock?: {
    headline: string;
    subheadline: string;
    ctaLabel: string;
    ctaHref: string;
    note: string;
    variant?: "primary" | "muted";
    image?: string;
  };
}

const ITEMS_PER_PAGE = 100;

/** Brand page, Direction B (design 13 Véhicules — 13d). */
export function VehicleBrandDetail({
  brandName,
  vehicles,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
  pageRegistry,
  heroIcon,
  heroIconSvg,
  heroImage,
  getQuoteBlock,
}: VehicleBrandDetailProps) {
  const d = (key: string, vars?: Record<string, string | number>) =>
    t(dictionary, key, vars);

  // Shared filter state
  const filters = useVehicleFilters(vehicles);
  const { filteredVehicles } = filters;
  const [currentPage, setCurrentPage] = useState(1);
  const resultsRef = useRef<HTMLDivElement>(null);

  const totalPages = Math.ceil(filteredVehicles.length / ITEMS_PER_PAGE);
  const paginated = filteredVehicles.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const resetPage = () => {
    if (currentPage !== 1) setCurrentPage(1);
  };

  const backHref = `/${lang}/${vehiclesSegment}/${brandsSegment}`;
  const quotePage = pageRegistry.find((p) => p.id === "quote");
  const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;
  const p = "pages.vehicle-brand";

  return (
    <div data-direction-b className="flex-1 bg-b-paper">
      <Container className="pt-3 md:pt-5">
        <Link
          href={backHref}
          className="inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-b-link hover:underline"
          data-testid="button-back-to-brands"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {d(`${p}.subheader.back`)}
        </Link>
      </Container>

      {/* Hero */}
      <section className="pt-4 pb-8 md:pt-8 md:pb-12">
        <Container className={heroImage ? "grid items-end gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14" : ""}>
          <div className="flex items-start gap-4 md:gap-5">
            <span className="inline-flex size-16 shrink-0 items-center justify-center rounded-xl bg-b-sand md:size-20">
              <BrandIcon iconSvg={heroIconSvg} iconName={heroIcon} className="size-9 md:size-11" />
            </span>
            <div className="min-w-0">
              <h1 className="mb-3 font-heading text-4xl font-semibold leading-[1.06] tracking-[-0.04em] md:text-[56px] md:leading-[1.04]">
                {d(`${p}.blocks.hero.headline`, { brand: brandName })}
              </h1>
              <p className="text-[17px] leading-relaxed text-muted-foreground md:text-lg">
                {d(`${p}.blocks.hero.subheadline`, { count: vehicles.length, brand: brandName })}
              </p>
            </div>
          </div>
          {heroImage && (
            <div className="relative aspect-video overflow-hidden rounded-xl bg-b-inset max-lg:hidden">
              <Image src={heroImage} alt="" fill priority fetchPriority="high" quality={60} sizes="(max-width: 1240px) 42vw, 480px" className="object-cover object-center" />
            </div>
          )}
        </Container>
      </section>

      <Container className="pb-16 md:pb-24">
        <VehicleFilters
          filters={filters}
          onFilterChange={resetPage}
          dictionary={dictionary}
          resultCount={filteredVehicles.length}
          status={
            <>
              {d(`${p}.vehiclesGrid.results.count`, { count: filteredVehicles.length })}
              {totalPages > 1 && <>{" · "}{d(`${p}.vehiclesGrid.results.page`, { current: currentPage, total: totalPages })}</>}
            </>
          }
        />
        <div ref={resultsRef} className="scroll-mt-24 pt-8">
          <VehicleGrid
            vehicles={paginated}
            page={currentPage}
            totalPages={totalPages}
            onPageChange={(n) => { setCurrentPage(n); resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            lang={lang}
            dictionary={dictionary}
            pageRegistry={pageRegistry}
            miniQuotePageId="vehicle-brand"
            miniQuoteVars={{ brand: brandName }}
            labels={{
              emptyTitle: d(`${p}.vehiclesGrid.results.empty.title`),
              emptyText: d(`${p}.vehiclesGrid.results.empty.text`),
              emptyQuote: opt(dictionary, `${p}.vehiclesGrid.results.empty.cta`),
              clear: d("shared.vehiclesFilters.clear"),
              previous: d(`${p}.vehiclesGrid.pagination.previous`),
              next: d(`${p}.vehiclesGrid.pagination.next`),
            }}
            onClearFilters={filters.hasActiveFilters ? () => { filters.clearFilters(); resetPage(); } : undefined}
            quoteHref={quoteHref}
          />
        </div>
      </Container>

      {getQuoteBlock && (
        <div className="pb-14">
          <CtaB
            title={getQuoteBlock.headline}
            subtitle={getQuoteBlock.subheadline}
            primary={{ label: getQuoteBlock.ctaLabel, href: getQuoteBlock.ctaHref }}
            note={getQuoteBlock.note}
          />
        </div>
      )}
    </div>
  );
}
