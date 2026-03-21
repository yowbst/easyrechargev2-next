import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchVehicle } from "@/lib/directus-queries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
import { VehicleDetailView } from "@/lib/vehicles/shared";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  resolveImageUrl,
  buildAlternates,
  getSiteUrl,
} from "@/lib/seo/resolver";
import { wrapInGraph, buildVehicleProduct } from "@/lib/seo/jsonLd";

interface Props {
  params: Promise<{ lang: string; vehicleSlug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, vehicleSlug } = await params;
  if (!isValidLang(lang)) return {};

  const locale = slugToDirectusLocale(lang);
  const vehicle = await fetchVehicle(vehicleSlug, locale);
  if (!vehicle) return {};

  const brandName = vehicle.brand?.name || "";
  const vehicleName = `${brandName} ${vehicle.model || vehicle.name || ""}`.trim();
  const battery = vehicle.battery?.value ? `${vehicle.battery.value} kWh` : "";
  const range = vehicle.range?.value ? `${vehicle.range.value} km` : "";
  const description = [vehicleName, battery, range].filter(Boolean).join(" | ");

  const SITE_URL = getSiteUrl();
  const imageUrl = vehicle.thumbnail ? resolveImageUrl(vehicle.thumbnail) : undefined;

  return buildMetadata({
    title: normalizeTitle(vehicleName),
    description: truncate(description),
    canonical: `${SITE_URL}/${lang}/vehicules/${vehicleSlug}`,
    ogImage: imageUrl,
    ogType: "website",
    lang,
    alternates: buildAlternates({
      fr: `/fr/vehicules/${vehicle.slug}`,
      de: `/de/fahrzeuge/${vehicle.slug}`,
    }),
  });
}

export default async function VehicleDetailPage({ params }: Props) {
  const { lang, vehicleSlug } = await params;
  if (!isValidLang(lang)) notFound();

  const locale = slugToDirectusLocale(lang);
  const vehicle = await fetchVehicle(vehicleSlug, locale);
  if (!vehicle) notFound();

  const brandName = vehicle.brand?.name || "";
  const vehicleName = `${brandName} ${vehicle.model || vehicle.name || ""}`.trim();
  const SITE_URL = getSiteUrl();
  const imageUrl = vehicle.thumbnail ? resolveImageUrl(vehicle.thumbnail) : undefined;

  const jsonLd = wrapInGraph(
    buildVehicleProduct({
      name: vehicleName,
      brand: brandName,
      description: vehicleName,
      imageUrl: imageUrl || `${SITE_URL}/og-default.webp`,
      url: `${SITE_URL}/${lang}/vehicules/${vehicleSlug}`,
    }),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VehicleDetailView
        vehicle={vehicle}
        lang={lang}
        vehiclesSegment="vehicules"
        brandsSegment="marques"
      />
    </>
  );
}
