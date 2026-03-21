import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
import { resolveSub1Route } from "@/lib/route-resolver";
import { fetchVehicle, fetchVehicleBrands, fetchVehicles, fetchLayout, fetchPage } from "@/lib/directus-queries";
import { extractLayoutDictionary, extractPageDictionary, t } from "@/lib/i18n/dictionaries";
import { VehicleDetailView, VehicleBrandsListView } from "@/lib/vehicles/shared";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  resolveImageUrl,
  buildAlternates,
  getSiteUrl,
} from "@/lib/seo/resolver";
import { wrapInGraph, buildVehicleProduct } from "@/lib/seo/jsonLd";
import { getRouteSlug } from "@/lib/i18n/config";
import Link from "next/link";
import { CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Sub1PageProps {
  params: Promise<{ lang: string; slug: string; sub1: string }>;
}

export const dynamicParams = true;

export async function generateMetadata({ params }: Sub1PageProps): Promise<Metadata> {
  const { lang, slug, sub1 } = await params;
  if (!isValidLang(lang)) return {};

  const route = await resolveSub1Route(slug, sub1, lang);
  if (!route) return {};

  const SITE_URL = getSiteUrl();

  if (route.type === "vehicle-detail") {
    const locale = slugToDirectusLocale(lang);
    const vehicle = await fetchVehicle(route.slug, locale);
    if (!vehicle) return {};

    const brandName = vehicle.brand?.name || "";
    const vehicleName = `${brandName} ${vehicle.model || vehicle.name || ""}`.trim();
    const battery = vehicle.battery?.value ? `${vehicle.battery.value} kWh` : "";
    const range = vehicle.range?.value ? `${vehicle.range.value} km` : "";
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");

    return buildMetadata({
      title: normalizeTitle(vehicleName),
      description: truncate([vehicleName, battery, range].filter(Boolean).join(" | ")),
      canonical: `${SITE_URL}/${lang}/${slug}/${sub1}`,
      ogImage: vehicle.thumbnail ? resolveImageUrl(vehicle.thumbnail) : undefined,
      ogType: "website",
      lang,
      alternates: buildAlternates({
        [lang]: `/${lang}/${slug}/${vehicle.slug}`,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${vehicle.slug}`,
      }),
    });
  }

  if (route.type === "quote-success") {
    return {
      title: "easyRecharge",  // noindex page — no SEO title needed
      robots: { index: false, follow: false },
    };
  }

  return {};
}

export default async function Sub1Page({ params }: Sub1PageProps) {
  const { lang, slug, sub1 } = await params;
  if (!isValidLang(lang)) notFound();

  const route = await resolveSub1Route(slug, sub1, lang);
  if (!route) notFound();

  const locale = slugToDirectusLocale(lang);
  const brandsSegment = getRouteSlug(lang, "brands");

  // Build merged dictionary: layout shared + vehicles page content
  const buildDictionary = async () => {
    const [layoutData, vehiclesPage] = await Promise.all([
      fetchLayout(locale),
      fetchPage("vehicles", locale),
    ]);
    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const pageDict = vehiclesPage ? extractPageDictionary("vehicles", vehiclesPage, locale) : {};
    return { ...layoutDict, ...pageDict };
  };

  // Vehicle detail
  if (route.type === "vehicle-detail") {
    const [vehicle, dictionary] = await Promise.all([
      fetchVehicle(route.slug, locale),
      buildDictionary(),
    ]);
    if (!vehicle) notFound();

    const brandName = vehicle.brand?.name || "";
    const vehicleName = `${brandName} ${vehicle.model || vehicle.name || ""}`.trim();
    const SITE_URL = getSiteUrl();
    const imageUrl = vehicle.thumbnail ? resolveImageUrl(vehicle.thumbnail) : undefined;

    const jsonLd = wrapInGraph(
      buildVehicleProduct({
        name: vehicleName, brand: brandName, description: vehicleName,
        imageUrl: imageUrl || `${SITE_URL}/og-default.webp`,
        url: `${SITE_URL}/${lang}/${slug}/${sub1}`,
      }),
    );

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <VehicleDetailView vehicle={vehicle} lang={lang} vehiclesSegment={slug} brandsSegment={brandsSegment} dictionary={dictionary} />
      </>
    );
  }

  // Vehicle brands listing
  if (route.type === "vehicle-brands") {
    const [brands, dictionary] = await Promise.all([
      fetchVehicleBrands(locale),
      buildDictionary(),
    ]);
    return (
      <VehicleBrandsListView brands={brands} lang={lang} vehiclesSegment={slug} brandsSegment={brandsSegment} dictionary={dictionary} />
    );
  }

  // Quote success
  if (route.type === "quote-success") {
    const quotePage = await fetchPage("quote-success", locale);
    const dictionary = quotePage ? extractPageDictionary("quote-success", quotePage, locale) : {};
    const d = (key: string) => t(dictionary, key);

    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="text-center space-y-6 max-w-lg px-4">
          <CheckCircle className="h-16 w-16 text-primary mx-auto" />
          <h1 className="font-heading text-3xl font-bold">
            {d("pages.quote-success.blocks.hero.title")}
          </h1>
          <p className="text-muted-foreground text-lg">
            {d("pages.quote-success.blocks.hero.subtitle")}
          </p>
          <Link
            href={`/${lang}`}
            className="inline-flex items-center justify-center rounded-lg px-8 h-9 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/80"
          >
            {d("pages.quote-success.blocks.hero.cta.label")}
          </Link>
        </div>
      </div>
    );
  }

  // Blog category listing: /{lang}/{blogSlug}/{categorySlug}
  if (route.type === "blog-listing") {
    // Redirect to the main blog page — category filtering handled there
    const { redirect } = await import("next/navigation");
    redirect(`/${lang}/${slug}`);
  }

  notFound();
}
