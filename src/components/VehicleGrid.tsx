"use client";

import Link from "next/link";
import { ArrowRight, Car, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { VehicleCard } from "@/components/VehicleCard";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import type { Vehicle } from "@/lib/vehicleTransformer";
import type { PageRegistryEntry } from "@/lib/directus-queries";

/** The mini-quote card in the vehicle grid is Sand with a Forest button (design 13). */
const SAND_SCOPE =
  "[--card:var(--b-sand,var(--card))] [--border:transparent] [--primary:var(--b-forest,var(--primary))] [--primary-foreground:var(--b-on-forest,var(--primary-foreground))] [&>*]:h-full [&>*]:rounded-xl [&>*]:shadow-none";

interface BrandIconData {
  name: string;
  iconName: string | null;
  iconSvg: string | null;
}

/**
 * Vehicle cards with the mini-quote card in third position, the empty state
 * and the pagination — shared by the vehicles hub and the brand pages.
 */
export function VehicleGrid({
  vehicles,
  brands = [],
  page,
  totalPages,
  onPageChange,
  lang,
  dictionary,
  pageRegistry,
  miniQuotePageId,
  miniQuoteVars,
  labels,
  onClearFilters,
  quoteHref,
}: {
  vehicles: Vehicle[];
  brands?: BrandIconData[];
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  lang: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  miniQuotePageId: string;
  miniQuoteVars?: Record<string, string>;
  labels: {
    emptyTitle: string;
    emptyText: string;
    emptyQuote?: string;
    clear: string;
    previous: string;
    next: string;
  };
  onClearFilters?: () => void;
  quoteHref?: string;
}) {
  if (vehicles.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-3.5 rounded-xl bg-b-sand px-6 py-16 text-center md:px-10">
        <span className="inline-flex size-14 items-center justify-center rounded-xl bg-b-paper">
          <Car className="size-6 text-b-link" aria-hidden />
        </span>
        <h3 className="font-heading text-[26px] font-semibold tracking-[-0.03em] md:text-[28px]">{labels.emptyTitle}</h3>
        <p className="max-w-[32.5rem] text-[17px] leading-relaxed text-muted-foreground">{labels.emptyText}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-b-forest px-5 text-[15px] font-semibold text-b-on-forest"
            >
              <RotateCcw className="size-4" aria-hidden />
              {labels.clear}
            </button>
          )}
          {quoteHref && labels.emptyQuote && (
            <Link
              href={quoteHref}
              className="inline-flex h-12 items-center gap-2 rounded-md bg-b-paper px-5 text-[15px] font-semibold"
            >
              {labels.emptyQuote}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          )}
        </div>
      </div>
    );
  }

  const normal = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  const cards: React.ReactNode[] = vehicles.map((vehicle) => {
    const brand = brands.find((b) => normal(b.name) === normal(vehicle.brand));
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
        brandIconSvg={brand?.iconSvg}
        brandIconName={brand?.iconName}
        isAvailable={vehicle.isAvailable}
        lang={lang}
        dictionary={dictionary}
      />
    );
  });
  cards.splice(
    Math.min(vehicles.length, 2),
    0,
    <div key="mini-quote-card" className={SAND_SCOPE}>
      <MiniQuoteCard
        pageId={miniQuotePageId}
        dictionary={dictionary}
        pageRegistry={pageRegistry}
        lang={lang}
        interpolationValues={miniQuoteVars}
      />
    </div>,
  );

  // 1 … n-1 n n+1 … total, as before.
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1 || (p === 2 && page > 3) || (p === totalPages - 1 && page < totalPages - 2),
  );

  const pageButton = "inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-2.5 text-[15px] font-semibold";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">{cards}</div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2 pt-12">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page === 1}
            className={`${pageButton} gap-1.5 bg-card px-3.5 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60`}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{labels.previous}</span>
          </button>
          {pages.map((p) => {
            const ellipsis = (p === 2 && page > 3) || (p === totalPages - 1 && page < totalPages - 2);
            if (ellipsis && Math.abs(p - page) > 1) {
              return <span key={p} className="px-1.5 text-muted-foreground" aria-hidden>…</span>;
            }
            const current = p === page;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={current ? "page" : undefined}
                className={`${pageButton} ${current ? "border-b-forest bg-b-forest text-b-on-forest" : "bg-card hover:bg-b-inset"}`}
                data-testid={`button-page-${p}`}
              >
                {p}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className={`${pageButton} gap-1.5 bg-card px-3.5 disabled:bg-transparent disabled:text-muted-foreground disabled:opacity-60`}
            data-testid="button-next-page"
          >
            <span className="max-sm:sr-only">{labels.next}</span>
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </nav>
      )}
    </>
  );
}
