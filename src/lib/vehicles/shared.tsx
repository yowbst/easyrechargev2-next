import Image from "next/image";
import Link from "next/link";
import { Car } from "lucide-react";
import * as SimpleIcons from "react-icons/si";
import { DIRECTUS_URL } from "@/lib/directus";
import { t } from "@/lib/i18n/dictionaries";
import { GetQuote } from "@/components/GetQuote";
import { cmsBgImage } from "@/lib/directusAssets";

function getBrandIconComponent(
  iconName?: string,
): React.ComponentType<{ className?: string }> {
  if (!iconName) return Car;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (SimpleIcons as any)[iconName] || Car;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

interface VehicleViewProps {
  vehicle: AnyRecord;
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
  dictionary: Record<string, string>;
}

/** Render a vehicle detail page. */
export function VehicleDetailView({
  vehicle,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
}: VehicleViewProps) {
  const d = (key: string) => t(dictionary, key);

  const brandName = vehicle.brand?.name || "";
  const modelName = vehicle.model || vehicle.name || "";
  const vehicleName = `${brandName} ${modelName}`.trim();
  const thumbnail = vehicle.thumbnail
    ? `${DIRECTUS_URL}/assets/${vehicle.thumbnail}`
    : null;

  const battery = vehicle.battery?.value
    ? `${vehicle.battery.value} ${vehicle.battery.unit || "kWh"}`
    : null;
  const range = vehicle.range?.value
    ? `${vehicle.range.value} ${vehicle.range.unit || "km"}`
    : null;
  const efficiency = vehicle.efficiency?.value
    ? `${vehicle.efficiency.value} ${vehicle.efficiency.unit || "Wh/km"}`
    : null;

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <Link
        href={`/${lang}/${vehiclesSegment}`}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← {d("pages.vehicles.vehiclesGrid.pagination.previous")}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {thumbnail && (
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
            <Image src={thumbnail} alt={vehicleName} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-contain" />
          </div>
        )}
        <div>
          {brandName && (
            <Link
              href={`/${lang}/${vehiclesSegment}/${brandsSegment}/${vehicle.brand?.slug || ""}`}
              className="text-sm text-primary font-medium"
            >
              {brandName}
            </Link>
          )}
          <h1 className="text-3xl md:text-4xl font-heading font-bold mt-1 mb-6">
            {vehicleName}
          </h1>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            {battery && (
              <>
                <dt className="text-muted-foreground">{d("shared.vehiclesFilters.general.battery.label")}</dt>
                <dd className="font-medium">{battery}</dd>
              </>
            )}
            {range && (
              <>
                <dt className="text-muted-foreground">{d("shared.vehiclesFilters.general.range.label")}</dt>
                <dd className="font-medium">{range}</dd>
              </>
            )}
            {efficiency && (
              <>
                <dt className="text-muted-foreground">{d("shared.vehiclesFilters.general.efficiency.label")}</dt>
                <dd className="font-medium">{efficiency}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

interface BrandWithCount {
  id: string | number;
  name: string;
  slug: string;
  icon_simple?: string;
  vehicleCount: number;
}

interface BrandsListProps {
  brandsWithCounts: BrandWithCount[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
  dictionary: Record<string, string>;
  heroTitle?: string;
  heroSubtitle?: string;
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

/** Render a vehicle brands listing page — matches source VehicleBrands.tsx layout. */
export function VehicleBrandsListView({
  brandsWithCounts,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
  heroTitle,
  heroSubtitle,
  heroImage,
  getQuoteBlock,
}: BrandsListProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  return (
    <div className="flex-1">
      {/* Back button */}
      <section className="py-6 border-b">
        <div className="container mx-auto px-4">
          <Link
            href={`/${lang}/${vehiclesSegment}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
            {d("pages.vehicle-brands.subheader.back")}
          </Link>
        </div>
      </section>

      {/* Hero */}
      <section
        className="relative py-16 md:py-24 overflow-hidden"
        style={heroImage ? { backgroundImage: `url(${cmsBgImage(heroImage)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        {heroImage ? (
          <div className="absolute inset-0 bg-slate-900/75" />
        ) : (
          <div className="absolute inset-0 bg-muted/50" />
        )}
        <div className="relative z-10 container mx-auto px-4">
          <div className="flex flex-col gap-4 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={heroImage ? "text-white" : "text-primary"}>
              <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
              <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
            </svg>
            <h1 className={`text-4xl md:text-5xl font-heading font-bold ${heroImage ? "text-white" : ""}`}>
              {heroTitle || d("pages.vehicle-brands.blocks.hero.headline")}
            </h1>
          </div>
          <p className={`text-lg w-full ${heroImage ? "text-white/80" : "text-muted-foreground"}`}>
            {heroSubtitle || d("pages.vehicle-brands.blocks.hero.subheadline", { count: brandsWithCounts.length })}
          </p>
        </div>
      </section>

      {/* Brand grid */}
      <section className="py-8 pb-16">
        <div className="container mx-auto px-4">
          {brandsWithCounts.length === 0 ? (
            <div className="text-center py-16">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 text-muted-foreground">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
                <circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>
              </svg>
              <h3 className="text-xl font-semibold mb-2">
                {d("pages.vehicle-brands.empty.title")}
              </h3>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
              {brandsWithCounts.map((brand) => (
                <Link
                  key={brand.id}
                  href={`/${lang}/${vehiclesSegment}/${brandsSegment}/${brand.slug}`}
                  title={brand.name}
                >
                  <div className="border rounded-xl p-6 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 h-full flex flex-col items-center text-center bg-card">
                    <div className="bg-muted rounded-lg p-4 mb-4">
                      {(() => {
                        const BrandIcon = getBrandIconComponent(brand.icon_simple);
                        return <BrandIcon className="h-12 w-12" />;
                      })()}
                    </div>
                    <h3 className="text-lg font-heading font-semibold mb-2">
                      {brand.name}
                    </h3>
                    <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      {brand.vehicleCount}{" "}
                      {d("pages.vehicle-brands.brandsGrid.count", { count: brand.vehicleCount })}
                    </span>
                  </div>
                </Link>
              ))}
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

