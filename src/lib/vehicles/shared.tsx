import Image from "next/image";
import Link from "next/link";
import { DIRECTUS_URL } from "@/lib/directus";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

/** Render a vehicle detail page. */
export function VehicleDetailView({
  vehicle,
  lang,
  vehiclesSegment,
  brandsSegment,
}: {
  vehicle: AnyRecord;
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
}) {
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
        ← {lang === "de" ? "Zurück" : "Retour"}
      </Link>

      <div className="grid md:grid-cols-2 gap-8 mb-12">
        {thumbnail && (
          <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
            <Image
              src={thumbnail}
              alt={vehicleName}
              fill
              className="object-contain"
            />
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
                <dt className="text-muted-foreground">
                  {lang === "de" ? "Batterie" : "Batterie"}
                </dt>
                <dd className="font-medium">{battery}</dd>
              </>
            )}
            {range && (
              <>
                <dt className="text-muted-foreground">
                  {lang === "de" ? "Reichweite" : "Autonomie"}
                </dt>
                <dd className="font-medium">{range}</dd>
              </>
            )}
            {efficiency && (
              <>
                <dt className="text-muted-foreground">
                  {lang === "de" ? "Effizienz" : "Efficacité"}
                </dt>
                <dd className="font-medium">{efficiency}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}

/** Render a vehicle brands listing page. */
export function VehicleBrandsListView({
  brands,
  lang,
  vehiclesSegment,
  brandsSegment,
}: {
  brands: AnyRecord[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
}) {
  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-heading font-bold mb-8">
        {lang === "de" ? "Fahrzeugmarken" : "Marques de véhicules"}
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

/** Render a single brand's vehicles page. */
export function VehicleBrandView({
  brandSlug,
  vehicles,
  lang,
  vehiclesSegment,
  brandsSegment,
}: {
  brandSlug: string;
  vehicles: AnyRecord[];
  lang: string;
  vehiclesSegment: string;
  brandsSegment: string;
}) {
  const brandVehicles = vehicles.filter(
    (v) => v.brand?.slug === brandSlug,
  );
  const brandName =
    brandVehicles[0]?.brand?.name ||
    brandSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <div className="container mx-auto px-4 py-12">
      <Link
        href={`/${lang}/${vehiclesSegment}/${brandsSegment}`}
        className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block"
      >
        ← {lang === "de" ? "Alle Marken" : "Toutes les marques"}
      </Link>

      <h1 className="text-3xl md:text-4xl font-heading font-bold mb-2">
        {brandName}
      </h1>
      <p className="text-muted-foreground mb-8">
        {brandVehicles.length}{" "}
        {lang === "de" ? "Elektrofahrzeuge" : "véhicules électriques"}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {brandVehicles.map((vehicle) => {
          const thumbnail = vehicle.thumbnail
            ? `${DIRECTUS_URL}/assets/${vehicle.thumbnail}`
            : null;
          const name = `${vehicle.brand?.name || ""} ${vehicle.model || vehicle.name || ""}`.trim();

          return (
            <Link
              key={vehicle.id}
              href={`/${lang}/${vehiclesSegment}/${vehicle.slug}`}
              className="border rounded-xl overflow-hidden hover:border-primary/50 transition-colors"
            >
              {thumbnail && (
                <div className="relative aspect-[16/10] bg-muted">
                  <Image
                    src={thumbnail}
                    alt={name}
                    fill
                    className="object-contain p-4"
                  />
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
