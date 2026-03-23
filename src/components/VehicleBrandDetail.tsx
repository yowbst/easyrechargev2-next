"use client";

import { useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Car } from "lucide-react";
import { t } from "@/lib/i18n/dictionaries";
import { cmsBgImage } from "@/lib/directusAssets";
import { VehicleCard } from "@/components/VehicleCard";
import { VehicleFilters } from "@/components/VehicleFilters";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { GetQuote } from "@/components/GetQuote";
import { useVehicleFilters } from "@/hooks/useVehicleFilters";
import { LucideCmsIcon } from "@/components/LucideCmsIcon";
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

export function VehicleBrandDetail({
  brandName,
  brandSlug,
  vehicles,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
  pageRegistry,
  heroIcon,
  heroImage,
  getQuoteBlock,
}: VehicleBrandDetailProps) {
  const d = (key: string, vars?: Record<string, string | number>) =>
    t(dictionary, key, vars);

  // Spotlight effect for hero
  const heroRef = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(
    null,
  );
  const handleHeroMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const rect = heroRef.current?.getBoundingClientRect();
      if (!rect) return;
      setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    },
    [],
  );
  const handleHeroMouseLeave = useCallback(() => setSpotlight(null), []);

  // Shared filter state
  const filters = useVehicleFilters(vehicles);
  const { filteredVehicles } = filters;

  const backHref = `/${lang}/${vehiclesSegment}/${brandsSegment}`;

  return (
    <div className="flex-1">
      {/* Back button */}
      <section className="py-6 border-b">
        <div className="container mx-auto px-4">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            data-testid="button-back-to-brands"
          >
            <ArrowLeft className="h-4 w-4" />
            {d("pages.vehicle-brand.subheader.back")}
          </Link>
        </div>
      </section>

      {/* Hero */}
      <section
        ref={heroRef}
        className="relative py-16 md:py-24 overflow-hidden"
        style={
          heroImage
            ? {
                backgroundImage: `url(${cmsBgImage(heroImage)})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
        onMouseMove={heroImage ? handleHeroMouseMove : undefined}
        onMouseLeave={heroImage ? handleHeroMouseLeave : undefined}
      >
        {heroImage ? (
          <div
            className="absolute inset-0 transition-all duration-200"
            aria-hidden="true"
            style={{
              background: spotlight
                ? `radial-gradient(circle 280px at ${spotlight.x}px ${spotlight.y}px, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.78) 100%)`
                : "rgba(15,23,42,0.75)",
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-muted/50" aria-hidden="true" />
        )}
        <div className="relative z-10 container mx-auto px-4">
          <div className="flex items-center gap-4 mb-4">
            <div
              className={`rounded-lg p-4 ${heroImage ? "bg-white/10 backdrop-blur" : "bg-background/90 backdrop-blur"}`}
            >
              <LucideCmsIcon
                name={heroIcon || "Car"}
                className={`h-12 w-12 ${heroImage ? "text-white" : ""}`}
              />
            </div>
            <div>
              <h1
                className={`text-4xl md:text-5xl font-heading font-bold ${heroImage ? "text-white" : ""}`}
              >
                {d("pages.vehicle-brand.blocks.hero.headline", {
                  brand: brandName,
                })}
              </h1>
              <p
                className={`text-lg mt-2 ${heroImage ? "text-white/80" : "text-muted-foreground"}`}
              >
                {d("pages.vehicle-brand.blocks.hero.subheadline", {
                  count: vehicles.length,
                  brand: brandName,
                })}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <VehicleFilters filters={filters} dictionary={dictionary} />

      {/* Results count */}
      <section className="py-4">
        <div className="container mx-auto px-4">
          <p className="text-sm text-muted-foreground">
            {d("pages.vehicle-brand.vehiclesGrid.results.count", {
              count: filteredVehicles.length,
            })}
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
                {d("pages.vehicle-brand.vehiclesGrid.results.empty.title")}
              </h3>
              <p className="text-muted-foreground">
                {d("pages.vehicle-brand.vehiclesGrid.results.empty.text")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {(() => {
                const cards = filteredVehicles.map((vehicle) => (
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
                    lang={lang}
                    dictionary={dictionary}
                  />
                ));

                // Insert MiniQuoteCard at position 3 (index 2)
                if (filteredVehicles.length > 0) {
                  const insertIndex = Math.min(filteredVehicles.length, 2);
                  cards.splice(
                    insertIndex,
                    0,
                    <MiniQuoteCard
                      key="mini-quote-card"
                      pageId="vehicle-brand"
                      dictionary={dictionary}
                      pageRegistry={pageRegistry}
                      lang={lang}
                      interpolationValues={{ brand: brandName }}
                    />,
                  );
                }

                return cards;
              })()}
            </div>
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
          variant={getQuoteBlock.variant}
          image={getQuoteBlock.image}
        />
      )}
    </div>
  );
}
