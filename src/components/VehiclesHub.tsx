"use client";

import { useState, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { getRouteSlug } from "@/lib/i18n/config";
import { resolveRouteId } from "@/lib/pageConfig";
import { BrandIcon } from "@/lib/vehicles/shared";
import { VehicleFilters } from "@/components/VehicleFilters";
import { VehicleGrid } from "@/components/VehicleGrid";
import { Container, Eyebrow } from "@/components/home-b/Shell";
import { CtaB } from "@/components/home-b/CtaB";
import { opt } from "@/components/home-b/content";
import { useVehicleFilters } from "@/hooks/useVehicleFilters";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface BrandData {
  name: string;
  iconName: string | null;
  iconSvg: string | null;
}

interface VehiclesHubProps {
  vehicles: Vehicle[];
  brands: BrandData[];
  lang: string;
  slug: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  heroTitle: string;
  heroSubtitle: string;
  heroImage?: string;
  heroIcon?: string;
  getQuoteBlock?: { headline: string; subheadline: string; ctaLabel: string; ctaHref: string; note: string; image?: string };
}

const normalizeName = (name: string | undefined): string => {
  if (!name) return "";
  return name.trim().toLowerCase();
};

const ITEMS_PER_PAGE = 100;

const brandChip = (on: boolean) =>
  `inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-3.5 text-[15px] transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    on ? "border-b-forest bg-b-forest font-semibold text-b-on-forest" : "border-border bg-card font-medium hover:bg-b-inset"
  }`;

/** Vehicles hub, Direction B (design 13 Véhicules — hub). */
export function VehiclesHub({
  vehicles,
  brands,
  lang,
  dictionary,
  pageRegistry,
  heroTitle,
  heroSubtitle,
  heroImage,
  getQuoteBlock,
}: VehiclesHubProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Vehicle brands from actual vehicle data
  const vehicleBrands = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.brand).filter(Boolean))),
    [vehicles],
  );

  // Brands sorted by vehicle count, with their counts
  const sortedBrands = useMemo(() => {
    const count = (name: string) => vehicles.filter((v) => normalizeName(v.brand) === normalizeName(name)).length;
    return [...brands]
      .map((b) => ({ ...b, count: count(b.name) }))
      .sort((a, b) => b.count - a.count || String(a.name || "").localeCompare(String(b.name || "")));
  }, [brands, vehicles]);

  // Shared filter state
  const filters = useVehicleFilters(vehicles);

  // Apply brand filter on top of hook's filtered results
  const filteredVehicles = useMemo(() => {
    if (!selectedBrand) return filters.filteredVehicles;
    return filters.filteredVehicles.filter(
      (v) => normalizeName(v.brand) === normalizeName(selectedBrand),
    );
  }, [filters.filteredVehicles, selectedBrand]);

  // Pagination
  const totalPages = Math.ceil(filteredVehicles.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedVehicles = filteredVehicles.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const resetPage = () => {
    if (currentPage !== 1) setCurrentPage(1);
  };
  const goToPage = (page: number) => {
    setCurrentPage(page);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const quotePage = pageRegistry.find((p) => p.id === "quote");
  const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;
  const allBrandsHref =
    resolveRouteId("vehicles-brands", lang, pageRegistry) ||
    `/${lang}/${getRouteSlug(lang, "vehicles")}/${getRouteSlug(lang, "brands")}`;

  const status = (
    <>
      {d("pages.vehicles.vehiclesGrid.results.count", { count: filteredVehicles.length })}
      {totalPages > 1 && (
        <>
          {" · "}
          {d("pages.vehicles.vehiclesGrid.results.page", { current: currentPage, total: totalPages })}
        </>
      )}
    </>
  );

  return (
    <div data-direction-b className="flex-1 bg-b-paper">
      {/* Hero — text left, photograph right */}
      <section className="pt-10 pb-8 md:pt-18 md:pb-12">
        <Container className={heroImage ? "grid items-end gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-14" : ""}>
          <div>
            {opt(dictionary, "pages.vehicles.hero.eyebrow") && <Eyebrow>{opt(dictionary, "pages.vehicles.hero.eyebrow")}</Eyebrow>}
            <h1 className="mb-4 font-heading text-4xl font-semibold leading-[1.06] tracking-[-0.04em] md:mb-4.5 md:text-[56px] md:leading-[1.04]">
              {heroTitle}
            </h1>
            <p className="max-w-150 text-[17px] leading-relaxed text-muted-foreground md:text-lg">{heroSubtitle}</p>
          </div>
          {heroImage && (
            <div className="relative aspect-video overflow-hidden rounded-xl bg-b-inset max-lg:hidden">
              {/* LCP element of the vehicles listing on desktop — never lazy. */}
              <Image src={heroImage} alt="" fill priority fetchPriority="high" quality={60} sizes="(max-width: 1240px) 42vw, 480px" className="object-cover object-center" />
            </div>
          )}
        </Container>
      </section>

      {/* Brands */}
      <section className="pb-6">
        <Container className="max-md:px-0">
          {opt(dictionary, "pages.vehicles.brandsFilters.title") && (
            <p className="type-label mb-3.5 tracking-widest text-muted-foreground max-md:px-5">
              {opt(dictionary, "pages.vehicles.brandsFilters.title")}
            </p>
          )}
          <div
            role="group"
            aria-label={opt(dictionary, "pages.vehicles.brandsFilters.title") ?? d("pages.vehicles.brandsFilters.badges.all", { count: vehicles.length })}
            className="flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0"
          >
            <button
              type="button"
              aria-pressed={selectedBrand === null}
              className={brandChip(selectedBrand === null)}
              onClick={() => { setSelectedBrand(null); resetPage(); }}
              data-testid="badge-brand-all"
            >
              {d("pages.vehicles.brandsFilters.badges.all", { count: vehicles.length })}
            </button>
            {sortedBrands.slice(0, 20).map((brand) => {
              const on = selectedBrand === brand.name;
              return (
                <button
                  key={brand.name}
                  type="button"
                  aria-pressed={on}
                  className={brandChip(on)}
                  onClick={() => { setSelectedBrand(brand.name); resetPage(); }}
                  data-testid={`badge-brand-${brand.name}`}
                >
                  <BrandIcon iconSvg={brand.iconSvg} iconName={brand.iconName} className="size-4.5" />
                  {brand.name}
                  <span className={`text-[13px] font-medium ${on ? "text-b-on-forest/78" : "text-muted-foreground"}`}>{brand.count}</span>
                </button>
              );
            })}
            <Link
              href={allBrandsHref}
              className="inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[15px] font-semibold text-b-link hover:underline"
              data-testid="button-view-all-brands"
            >
              {d("pages.vehicles.brandsFilters.count", { count: vehicleBrands.length })}
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Container>
      </section>

      {/* Filters + results */}
      <Container className="pb-16 md:pb-24">
        <VehicleFilters
          filters={filters}
          onFilterChange={resetPage}
          dictionary={dictionary}
          resultCount={filteredVehicles.length}
          status={status}
        />
        <div ref={resultsRef} className="scroll-mt-24 pt-8">
          <VehicleGrid
            vehicles={paginatedVehicles}
            brands={sortedBrands}
            page={currentPage}
            totalPages={totalPages}
            onPageChange={goToPage}
            lang={lang}
            dictionary={dictionary}
            pageRegistry={pageRegistry}
            miniQuotePageId="vehicles"
            labels={{
              emptyTitle: d("pages.vehicles.vehiclesGrid.results.empty.title"),
              emptyText: d("pages.vehicles.vehiclesGrid.results.empty.text"),
              emptyQuote: opt(dictionary, "pages.vehicles.vehiclesGrid.results.empty.cta"),
              clear: d("shared.vehiclesFilters.clear"),
              previous: d("pages.vehicles.vehiclesGrid.pagination.previous"),
              next: d("pages.vehicles.vehiclesGrid.pagination.next"),
            }}
            onClearFilters={
              filters.hasActiveFilters || selectedBrand
                ? () => { filters.clearFilters(); setSelectedBrand(null); resetPage(); }
                : undefined
            }
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
