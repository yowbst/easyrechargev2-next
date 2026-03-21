import Image from "next/image";
import Link from "next/link";
import { DIRECTUS_URL } from "@/lib/directus";
import { t } from "@/lib/i18n/dictionaries";

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

interface BrandsListProps {
  brands: AnyRecord[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
  dictionary: Record<string, string>;
}

/** Render a vehicle brands listing page. */
export function VehicleBrandsListView({
  brands,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
}: BrandsListProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-heading font-bold mb-8">
        {d("pages.vehicles.brandsFilters.badges.all", { count: brands.length })}
      </h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {brands.map((brand) => (
          <Link
            key={brand.id}
            href={`/${lang}/${vehiclesSegment}/${brandsSegment}/${brand.slug}`}
            className="border rounded-lg p-4 hover:border-primary/50 transition-colors text-center"
          >
            {brand.icon_simple && (
              <Image
                src={`${DIRECTUS_URL}/assets/${brand.icon_simple}`}
                alt={brand.name}
                width={64}
                height={64}
                className="mx-auto mb-2 h-16 w-16 object-contain"
              />
            )}
            <span className="font-medium text-sm">{brand.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface BrandViewProps {
  brandSlug: string;
  vehicles: AnyRecord[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
  dictionary: Record<string, string>;
}

/** Render a single brand's vehicles page. */
export function VehicleBrandView({
  brandSlug,
  vehicles,
  lang,
  vehiclesSegment,
  brandsSegment,
  dictionary,
}: BrandViewProps) {
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  const brandVehicles = vehicles.filter((v) => v.brand?.slug === brandSlug);
  const brandName =
    brandVehicles[0]?.brand?.name ||
    brandSlug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  return (
    <div className="container mx-auto px-4 py-12">
      <Link
        href={`/${lang}/${vehiclesSegment}/${brandsSegment}`}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← {d("pages.vehicles.vehiclesGrid.pagination.previous")}
      </Link>

      <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2">
        {brandName}
      </h1>
      <p className="text-muted-foreground mb-8">
        {d("pages.vehicles.vehiclesGrid.results.count_other", { count: brandVehicles.length })}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brandVehicles.map((vehicle) => {
          const thumbnail = vehicle.thumbnail ? `${DIRECTUS_URL}/assets/${vehicle.thumbnail}` : null;
          const name = `${vehicle.brand?.name || ""} ${vehicle.model || vehicle.name || ""}`.trim();

          return (
            <Link
              key={vehicle.id}
              href={`/${lang}/${vehiclesSegment}/${vehicle.slug}`}
              className="border rounded-xl overflow-hidden hover:border-primary/50 transition-colors"
            >
              {thumbnail && (
                <div className="relative aspect-[16/10] bg-muted">
                  <Image src={thumbnail} alt={name} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain p-4" />
                </div>
              )}
              <div className="p-4">
                <h2 className="font-medium">{name}</h2>
                {vehicle.range?.value && (
                  <p className="text-sm text-muted-foreground">
                    {vehicle.range.value} {vehicle.range.unit || "km"}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
