"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Car, ChevronRight } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { getRouteSlug } from "@/lib/i18n/config";
import { resolveRouteId } from "@/lib/pageConfig";
import { cmsBgImage } from "@/lib/directusAssets";
import { VehicleCard } from "@/components/VehicleCard";
import { VehicleFilters } from "@/components/VehicleFilters";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { GetQuote } from "@/components/GetQuote";
import { useVehicleFilters } from "@/hooks/useVehicleFilters";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface BrandData {
  name: string;
  iconName: string | null;
}

interface BrandWithIcon {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
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

export function VehiclesHub({
  vehicles,
  brands,
  lang,
  slug,
  dictionary,
  pageRegistry,
  heroTitle,
  heroSubtitle,
  heroImage,
  getQuoteBlock,
}: VehiclesHubProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  // Resolve brand icons client-side (components can't be serialized from server)
  const brandsWithIcons: BrandWithIcon[] = useMemo(
    () => brands.map((b) => ({ name: b.name, icon: Car })),
    [brands],
  );

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Spotlight effect for hero
  const heroRef = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(null);
  const handleHeroMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);
  const handleHeroMouseLeave = useCallback(() => setSpotlight(null), []);

  // Vehicle brands from actual vehicle data
  const vehicleBrands = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.brand).filter(Boolean))),
    [vehicles],
  );

  // Sort brands by vehicle count
  const sortedBrands = useMemo(() => {
    return [...brandsWithIcons].sort((a, b) => {
      const countA = vehicles.filter((v) => normalizeName(v.brand) === normalizeName(a.name)).length;
      const countB = vehicles.filter((v) => normalizeName(v.brand) === normalizeName(b.name)).length;
      if (countB !== countA) return countB - countA;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }, [brandsWithIcons, vehicles]);

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

  return (
    <div className="flex-1">
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative py-16 md:py-28 overflow-hidden"
        style={heroImage ? { backgroundImage: `url(${cmsBgImage(heroImage)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        onMouseMove={heroImage ? handleHeroMouseMove : undefined}
        onMouseLeave={heroImage ? handleHeroMouseLeave : undefined}
      >
        {heroImage && (
          <div
            className="absolute inset-0"
            aria-hidden="true"
            style={{
              background: spotlight
                ? `radial-gradient(circle 280px at ${spotlight.x}px ${spotlight.y}px, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.78) 100%)`
                : "rgba(15,23,42,0.75)",
            }}
          />
        )}
        {!heroImage && <div className="absolute inset-0 bg-muted/50" aria-hidden="true" />}

        <div className="relative container mx-auto px-4">
          <div className="flex flex-col gap-4 mb-4">
            <h1 className={`text-4xl md:text-5xl font-heading font-bold ${heroImage ? "text-white" : ""}`}>
              {heroTitle}
            </h1>
          </div>
          <p className={`text-lg w-full ${heroImage ? "text-white/85" : "text-muted-foreground"}`}>
            {heroSubtitle}
          </p>
        </div>
      </section>

      {/* Brand Filter */}
      <section className="py-8 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-3">
            <Badge
              variant={selectedBrand === null ? "default" : "outline"}
              className="cursor-pointer px-4 py-2"
              onClick={() => { setSelectedBrand(null); resetPage(); }}
              data-testid="badge-brand-all"
            >
              {d("pages.vehicles.brandsFilters.badges.all", { count: vehicles.length })}
            </Badge>
            {sortedBrands.slice(0, 20).map((brand) => {
              const Logo = brand.icon;
              const vehicleCount = vehicles.filter(
                (v) => normalizeName(v.brand) === normalizeName(brand.name),
              ).length;
              return (
                <Badge
                  key={brand.name}
                  variant={selectedBrand === brand.name ? "default" : "outline"}
                  className="cursor-pointer px-4 py-2 gap-2"
                  onClick={() => { setSelectedBrand(brand.name); resetPage(); }}
                  data-testid={`badge-brand-${brand.name}`}
                >
                  {Logo && <Logo className="h-4 w-4" />}
                  {brand.name} ({vehicleCount})
                </Badge>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Link
              href={
                resolveRouteId("vehicles-brands", lang, pageRegistry) ||
                `/${lang}/${getRouteSlug(lang, "vehicles")}/${getRouteSlug(lang, "brands")}`
              }
              title={d("pages.vehicles.brandsFilters.count", { count: vehicleBrands.length })}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors px-3 py-1.5 rounded-md hover:bg-muted"
              data-testid="button-view-all-brands"
            >
              {d("pages.vehicles.brandsFilters.count", { count: vehicleBrands.length })}
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Advanced Filters */}
      <VehicleFilters
        filters={filters}
        onFilterChange={resetPage}
        dictionary={dictionary}
      />

      {/* Results count */}
      <section className="py-4">
        <div className="container mx-auto px-4">
          <p className="text-sm text-muted-foreground">
            {d("pages.vehicles.vehiclesGrid.results.count", { count: filteredVehicles.length })}
            {totalPages > 1 && (
              <span>
                {" | "}
                {d("pages.vehicles.vehiclesGrid.results.page", {
                  current: currentPage,
                  total: totalPages,
                })}
              </span>
            )}
          </p>
        </div>
      </section>

      {/* Vehicles Grid */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4">
          {filteredVehicles.length === 0 ? (
            <div className="text-center py-16">
              <Car className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-xl font-semibold mb-2">
                {d("pages.vehicles.vehiclesGrid.results.empty.title")}
              </h3>
              <p className="text-muted-foreground">
                {d("pages.vehicles.vehiclesGrid.results.empty.text")}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {(() => {
                  const cards = paginatedVehicles.map((vehicle) => {
                    const brandData = sortedBrands.find(
                      (b) => normalizeName(b.name) === normalizeName(vehicle.brand),
                    );
                    return (
                      <VehicleCard
                        key={vehicle.id}
                        id={vehicle.id}
                        brand={vehicle.brand}
                        model={vehicle.model}
                        slug={vehicle.slug}
                        image={vehicle.image}
                        rangeDisplay={vehicle.rangeDisplay}
                        batteryDisplay={vehicle.batteryDisplay}
                        efficiencyDisplay={vehicle.efficiencyDisplay}
                        pricePerRange={vehicle.pricePerRange}
                        charging={vehicle.charging}
                        BrandLogo={brandData?.icon}
                        lang={lang}
                        dictionary={dictionary}
                      />
                    );
                  });

                  // Insert MiniQuoteCard at position 3 (index 2)
                  if (paginatedVehicles.length > 0) {
                    const insertIndex = Math.min(paginatedVehicles.length, 2);
                    cards.splice(
                      insertIndex,
                      0,
                      <MiniQuoteCard
                        key="mini-quote-card"
                        pageId="vehicles"
                        dictionary={dictionary}
                        pageRegistry={pageRegistry}
                        lang={lang}
                      />,
                    );
                  }

                  return cards;
                })()}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mt-12">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    {d("pages.vehicles.vehiclesGrid.pagination.previous")}
                  </Button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                      const showPage =
                        page === 1 ||
                        page === totalPages ||
                        Math.abs(page - currentPage) <= 1;
                      const showEllipsis =
                        (page === 2 && currentPage > 3) ||
                        (page === totalPages - 1 && currentPage < totalPages - 2);

                      if (!showPage && !showEllipsis) return null;

                      if (showEllipsis) {
                        return (
                          <span key={page} className="px-2 text-muted-foreground">...</span>
                        );
                      }

                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="min-w-9"
                          data-testid={`button-page-${page}`}
                        >
                          {page}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    {d("pages.vehicles.vehiclesGrid.pagination.next")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* GetQuote CTA */}
      {getQuoteBlock && (
        <GetQuote
          title={getQuoteBlock.headline}
          subtitle={getQuoteBlock.subheadline}
          ctaLabel={getQuoteBlock.ctaLabel}
          ctaHref={getQuoteBlock.ctaHref}
          note={getQuoteBlock.note}
          image={getQuoteBlock.image}
        />
      )}
    </div>
  );
}
