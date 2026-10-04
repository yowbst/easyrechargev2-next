import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { isValidLang, slugToDirectusLocale, getRouteSlug } from "@/lib/i18n/config";
import { GoogleAdsConversion } from "@/components/GoogleAdsConversion";
import { OpenAIConversion } from "@/components/OpenAIConversion";
import { adsSendTo } from "@/lib/googleAds";
import { successPageIds, viewPageIds } from "@/lib/products";
import { resolveSub1Route } from "@/lib/route-resolver";
import {
  fetchVehicle,
  fetchVehicleBrands,
  fetchVehicles,
  fetchBlogPosts,
  fetchLayout,
  fetchPage,
  fetchPageRegistry,
} from "@/lib/directus-queries";
import { extractLayoutDictionary, extractPageDictionary, t } from "@/lib/i18n/dictionaries";
import { VehicleBrandsListView, BrandIcon } from "@/lib/vehicles/shared";
import { transformDirectusVehicle, formatMinutes, type Vehicle } from "@/lib/vehicleTransformer";
import { DIRECTUS_URL } from "@/lib/directus";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  extractItemSEO,
  mergeItemOverTemplate,
  resolveSEOFieldMappings,
  resolveImageUrl,
  resolveOgImage,
  buildAlternates,
  getSiteUrl,
} from "@/lib/seo/resolver";
import { wrapInGraph, buildVehicleCar, buildBreadcrumbList, buildFAQPage } from "@/lib/seo/jsonLd";
import {
  generateVehicleIntro,
  generateChargingAdvice,
  generateCostEstimate,
  generateVehicleFAQ,
  generateTechSpecsIntro,
  generateRealRangeIntro,
  generateChargingFeaturesIntro,
} from "@/lib/vehicle-content";
import {
  VehicleSeoAdvice,
  VehicleSeoCost,
  VehicleSeoFAQ,
} from "@/components/VehicleSeoSections";
import { findSameBrandVehicles, findSimilarVehicles } from "@/lib/vehicles/related";
import { transformBlogPost } from "@/lib/blog/transform";
import { RelatedContent } from "@/components/RelatedContent";
import { LazyMiniQuoteCard as MiniQuoteCard } from "@/components/LazyMiniQuoteCard";
import { CtaB } from "@/components/home-b/CtaB";

// Client-side lazy variants — see lazy-page-variants.tsx for why these must
// not be dynamic()-imported from this Server Component.
import {
  VehicleDetailClient,
  QuoteSuccess as QuoteSuccessClient,
  QuoteSubmissionView as QuoteSubmissionViewClient,
} from "@/components/lazy-page-variants";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  CheckCircle,
  Battery,
  Car,
  Zap,
  Plug,
  Gauge,
  BatteryCharging,
  Check,
  X,
  Clock,
  Thermometer,
  Wifi,
  PlugZap,
  Home,
  Network,
  BatteryFull,
  BatteryMedium,
  FlaskConical,
  Layers,
  ShieldCheck,
  Rocket,
  Timer,
  RotateCcw,
  Maximize2,
  ArrowLeftRight,
  Scale,
  Package,
  Users,
  Truck,
  Ruler,
  Snowflake,
  Sun,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

// --- Vehicle detail inline helpers ---

function SpecRow({
  icon: Icon,
  label,
  value,
  tooltip,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <span className="flex items-center gap-2 text-[15px] text-muted-foreground">
        {Icon && <Icon className="size-4 shrink-0" />}
        {tooltip ? <InfoTooltip content={tooltip}>{label}</InfoTooltip> : label}
      </span>
      <span className="text-right text-[15px] font-semibold">{value ?? "-"}</span>
    </div>
  );
}

function BooleanBadge({
  supported,
  tYes,
  tNo,
}: {
  supported: boolean | undefined | null;
  tYes: string;
  tNo: string;
}) {
  if (supported == null) return <span className="text-muted-foreground text-sm">-</span>;
  return supported ? (
    <Badge variant="default" className="bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/20 gap-1 min-w-[4.5rem] justify-center">
      <Check className="h-3 w-3" />
      {tYes}
    </Badge>
  ) : (
    <Badge variant="secondary" className="gap-1 opacity-60 min-w-[4.5rem] justify-center">
      <X className="h-3 w-3" />
      {tNo}
    </Badge>
  );
}

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
  const locale = slugToDirectusLocale(lang);

  // ── Vehicle detail: /{lang}/{vehiclesSlug}/{vehicleSlug} ──
  if (route.type === "vehicle-detail") {
    const [directusVehicle, templatePage] = await Promise.all([
      fetchVehicle(route.slug, locale),
      fetchPage("vehicle", locale),
    ]);
    if (!directusVehicle) return {};

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) return {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = directusVehicle as Record<string, any>;
    const brandName = vehicle.brand;
    const modelName = vehicle.model;
    const vehicleName = `${brandName} ${modelName}`.trim();

    // Build comprehensive fieldMap matching source seoResolver
    const acPower = dv.charging?.home_destination?.charge_power;
    const dcMaxPower = dv.charging?.fast_charging?.charge_power_max;
    const dcTime = dv.charging?.fast_charging?.charge_time;
    const homeChargeTime = dv.charging?.home_destination?.charge_time;
    const dcPort = dv.charging?.fast_charging?.charge_port;
    const perf = dv.performance;
    const realRangeMin = dv.real_range?.headline?.from?.value;
    const realRangeMax = dv.real_range?.headline?.to?.value;

    const fieldMap: Record<string, unknown> = {
      brand: brandName,
      model: modelName,
      name: vehicleName,
      slug: route.slug,
      battery: vehicle.batteryDisplay,
      range: vehicle.rangeDisplay,
      efficiency: vehicle.efficiencyDisplay,
      acPower: acPower?.value ? `${acPower.value} ${acPower.unit || "kW"}` : undefined,
      dcPower: dcMaxPower?.value ? `${dcMaxPower.value} ${dcMaxPower.unit || "kW"}` : undefined,
      chargeTime: homeChargeTime?.value ? formatMinutes(homeChargeTime.value) : undefined,
      dcTime: dcTime?.value ? `${dcTime.value} ${dcTime.unit || "min"}` : undefined,
      chargePort: typeof dcPort === "string" ? dcPort : undefined,
      rangeMin: realRangeMin ? `${realRangeMin} km` : undefined,
      rangeMax: realRangeMax ? `${realRangeMax} km` : undefined,
      acceleration: perf?.acceleration_0_100?.value ? `${perf.acceleration_0_100.value} ${perf.acceleration_0_100.unit || "sec"}` : undefined,
      topSpeed: perf?.top_speed?.value ? `${perf.top_speed.value} ${perf.top_speed.unit || "km/h"}` : undefined,
      power: perf?.power?.ps?.value ? `${perf.power.ps.value} ${perf.power.ps.unit || "PS"}` : undefined,
    };

    // Vehicles have no item-level SEO — only template SEO
    const templateSeo = extractItemSEO(templatePage?.translations?.[0]?.seo);
    const merged = mergeItemOverTemplate(undefined, templateSeo);
    const resolved = resolveSEOFieldMappings(merged, fieldMap);

    const title = resolved?.title || vehicleName;
    const description = resolved?.description || [vehicleName, vehicle.batteryDisplay, vehicle.rangeDisplay, vehicle.chargingDisplay].filter(Boolean).join(" | ");

    const currentPath = `/${lang}/${slug}/${sub1}`;
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");

    const vehicleImage = directusVehicle.thumbnail ? resolveImageUrl(directusVehicle.thumbnail) : undefined;
    const heroImage = templatePage?.blocks?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.collection === "block_hero",
    )?.item?.image;

    return buildMetadata({
      title: normalizeTitle(title),
      description: truncate(description),
      canonical: `${SITE_URL}${currentPath}`,
      ogImage: resolveOgImage(resolved, vehicleImage, heroImage),
      ogType: "website",
      robots: resolved?.noIndex ? "noindex, nofollow" : undefined,
      lang,
      alternates: buildAlternates({
        [lang]: `/${lang}/${slug}/${route.slug}`,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${route.slug}`,
      }),
    });
  }

  // ── Vehicle brands listing: /{lang}/{vehiclesSlug}/{brandsSegment} ──
  if (route.type === "vehicle-brands") {
    const [templatePage, rawVehicles] = await Promise.all([
      fetchPage("vehicle-brands", locale),
      fetchVehicles(locale),
    ]);

    const vehicles = rawVehicles || [];
    const brandNames = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const v of vehicles as any[]) {
      if (v.brand?.name) brandNames.add(v.brand.name);
    }

    const fieldMap: Record<string, unknown> = {
      count: brandNames.size,
      vehicles: vehicles.length,
    };

    const templateSeo = extractItemSEO(templatePage?.translations?.[0]?.seo);
    const resolved = resolveSEOFieldMappings(templateSeo, fieldMap);

    const currentPath = `/${lang}/${slug}/${sub1}`;
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");
    const brandsSlugOther = getRouteSlug(otherLang, "brands");

    const heroImage = templatePage?.blocks?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.collection === "block_hero",
    )?.item?.image;

    return buildMetadata({
      title: normalizeTitle(resolved?.title || "vehicle-brands"),
      description: truncate(resolved?.description || ""),
      canonical: `${SITE_URL}${currentPath}`,
      ogImage: resolveOgImage(resolved, undefined, heroImage),
      ogType: "website",
      robots: resolved?.noIndex ? "noindex, nofollow" : undefined,
      lang,
      alternates: buildAlternates({
        [lang]: currentPath,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${brandsSlugOther}`,
      }),
    });
  }

  if (route.type === "quote-success" || route.type === "quote-submission") {
    return {
      title: "easyRecharge",
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

  // Build merged dictionary
  const buildDictionary = async (pageId: string) => {
    const [layoutData, page] = await Promise.all([
      fetchLayout(locale),
      fetchPage(pageId, locale),
    ]);
    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const pageDict = page ? extractPageDictionary(pageId, page, locale) : {};
    const dict = { ...layoutDict, ...pageDict };

    // Pre-interpolate SLA vars
    const gc = layoutData?.global_config || {};
    const slas = gc?.slas || {};
    const slaVars: Record<string, string> = {
      quote_request_duration: String(slas?.quote_request_duration?.value ?? 3),
      first_contact: String(slas?.first_contact?.value ?? 48),
    };
    for (const key of Object.keys(dict)) {
      for (const [varName, varVal] of Object.entries(slaVars)) {
        if (dict[key].includes(`{${varName}}`)) {
          dict[key] = dict[key].replace(new RegExp(`\\{${varName}\\}`, "g"), varVal);
        }
      }
    }
    return { dict, layoutData, page };
  };

  // Vehicle detail
  if (route.type === "vehicle-detail") {
    const [directusVehicle, { dict: dictionary, layoutData, page: vehiclePage }, registry, allRawVehicles, allBlogPosts] = await Promise.all([
      fetchVehicle(route.slug, locale),
      buildDictionary("vehicle"),
      fetchPageRegistry(),
      fetchVehicles(locale),
      fetchBlogPosts(locale),
    ]);
    if (!directusVehicle) notFound();

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) notFound();

    const d = (key: string, vars?: Record<string, string | number>) => {
      const val = t(dictionary, key, vars);
      return val === key ? `[${key}]` : val;
    };

    // --- Extract rich vehicle data ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dv = directusVehicle as Record<string, any>;
    const description = dv.description || "";
    const homeCharging = vehicle.charging?.home_destination;
    const homeChargingDetailsRaw: Record<string, unknown>[] =
      dv.home_destination_charging_details?.type2_plug || [];
    const homeChargingDetails = homeChargingDetailsRaw.map((row: Record<string, unknown>) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = row as Record<string, any>;
      return {
        charging_point: r.charging_point?.type || r.charging_point || r.name,
        charge_power: r.power ? { value: r.power.value, unit: r.power.unit } : r.charge_power,
        charge_time: r.time ? { value: r.time.value, unit: r.time.unit } : r.charge_time,
        charge_speed: r.rate ? { value: r.rate.value, unit: r.rate.unit } : r.charge_speed,
        is_limited: r.charging_point?.power?.value != null && r.power?.value != null
          && r.power.value < r.charging_point.power.value,
        limited: r.limited,
      };
    });

    const fastChargingData = dv.charging?.fast_charging;
    const plugCharge = dv.charging?.plug_charge;
    const batteryPreconditioning = dv.charging?.battery_preconditioning;
    const realRange = dv.real_range;
    const batteryDetails = dv.battery_details;
    const perf = dv.performance;
    const dims = dv.dimensions_weight;
    const v2x = dv.v2x_charging;

    const dcMaxPower = fastChargingData?.charge_power_max;
    const dcAvgPower = fastChargingData?.charge_power_10_80 || fastChargingData?.charge_power;
    const dcTime = fastChargingData?.charge_time;
    const dcSpeed = fastChargingData?.charge_speed;
    const dcPort = fastChargingData?.charge_port;
    const autocharge = fastChargingData?.autocharge_supported;
    const acPower = homeCharging?.charge_power;

    const realRangeMin = realRange?.worst?.value;
    const realRangeMax = realRange?.best?.value;
    const coldCity = realRange?.cold_weather?.city;
    const coldHighway = realRange?.cold_weather?.highway;
    const coldCombined = realRange?.cold_weather?.combined;
    const mildCity = realRange?.mild_weather?.city;
    const mildHighway = realRange?.mild_weather?.highway;
    const mildCombined = realRange?.mild_weather?.combined;

    const brandName = dv.brand?.name || "";
    const brandSlug = dv.brand?.slug || "";
    const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fmtField = (field: any): string => {
      if (field == null) return "-";
      if (typeof field !== "object") return String(field);
      if (field.value != null) return `${field.value} ${field.unit || ""}`.trim();
      if (field.type != null) return String(field.type);
      if (field.name != null) return String(field.name);
      return "-";
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeStr = (val: any): string => {
      if (val == null) return "-";
      if (typeof val === "string") return val;
      if (typeof val === "number") return String(val);
      return fmtField(val);
    };

    // SEO content generation
    const seoLocale = lang as "fr" | "de";
    const tariffCHF = layoutData?.global_config?.electricity_tariff_chf ?? 0.32;
    const seoIntro = generateVehicleIntro(vehicle, homeChargingDetails, dictionary, dv);
    const seoAdvice = generateChargingAdvice(dv, vehicle, homeChargingDetails, dictionary, seoLocale);
    const seoCost = generateCostEstimate(vehicle, tariffCHF, dictionary);
    const seoFaq = generateVehicleFAQ(vehicle, dv, homeChargingDetails, seoCost, dictionary, seoLocale);
    const seoTechSpecs = generateTechSpecsIntro(vehicle, dv, seoLocale);
    const seoRealRange = generateRealRangeIntro(vehicle, dv, seoLocale);
    const seoChargingFeatures = generateChargingFeaturesIntro(vehicle, dv, seoLocale);

    // Related content
    const allVehicles = allRawVehicles.map(transformDirectusVehicle).filter(Boolean) as Vehicle[];
    const sameBrandVehicles = findSameBrandVehicles(vehicle, allVehicles, 5);
    const similarVehicles = findSimilarVehicles(vehicle, allVehicles, 5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const featuredPosts = allBlogPosts
      .filter((p: any) => p.featured === true && p.translations?.length > 0)
      .slice(0, 3)
      .map((p: any) => transformBlogPost(p, lang));

    // JSON-LD
    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}`;
    const absoluteImage = dv.thumbnail
      ? (resolveImageUrl(dv.thumbnail) || `${SITE_URL}/og-default.webp`)
      : `${SITE_URL}/og-default.webp`;

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: d("pages.vehicle.breadcrumb.vehicles"), url: `${SITE_URL}/${lang}/${slug}` },
        { name: brandName, url: `${SITE_URL}/${lang}/${slug}/${brandsSegment}/${brandSlug}` },
        { name: vehicleName, url: `${SITE_URL}${currentPath}` },
      ]),
      buildVehicleCar({
        name: vehicleName,
        brand: vehicle.brand,
        description: description || `${vehicleName} - EV charging specifications`,
        imageUrl: absoluteImage,
        url: `${SITE_URL}${currentPath}`,
        vehicleConfiguration: perf?.drive_type ? safeStr(perf.drive_type) : undefined,
        properties: {
          batteryCapacity: vehicle.batteryDisplay,
          range: vehicle.rangeDisplay,
          acChargingPower: acPower?.value ? `${acPower.value} ${acPower.unit || "kW"}` : undefined,
          dcMaxChargingPower: dcMaxPower?.value ? `${dcMaxPower.value} ${dcMaxPower.unit || "kW"}` : undefined,
          chargePort: typeof dcPort === "string" ? dcPort : undefined,
          efficiency: vehicle.efficiencyDisplay,
        },
      }),
      seoFaq ? buildFAQPage(seoFaq.items.map((item) => ({
        question: item.question,
        answer: item.answer,
      }))) : null,
    );

    // GetQuote block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = vehiclePage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const hasGetQuoteBlock = !!getQuoteBlock?.translations?.[0];
    const quotePage = registry.find((p) => p.id === "quote");
    const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <div data-direction-b className="flex-1 bg-b-paper">
          {/* Breadcrumbs */}
          <nav aria-label="breadcrumb" className="mx-auto w-full max-w-[1240px] px-5 pt-4 md:px-10 md:pt-5">
            <ol className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <li>
                <Link href={`/${lang}/${slug}`} className="text-b-link underline underline-offset-3 hover:opacity-80">
                  {d("pages.vehicle.breadcrumb.vehicles")}
                </Link>
              </li>
              <li aria-hidden><ChevronRight className="size-3.5 shrink-0" /></li>
              <li>
                <Link href={`/${lang}/${slug}/${brandsSegment}/${brandSlug}`} className="text-b-link underline underline-offset-3 hover:opacity-80">
                  {brandName}
                </Link>
              </li>
              <li aria-hidden><ChevronRight className="size-3.5 shrink-0" /></li>
              <li aria-current="page" className="max-w-[240px] truncate font-semibold text-foreground">{vehicle.model}</li>
            </ol>
          </nav>

          {/* HERO: image + brand/model + key specs (design 14 Véhicules — 14a) */}
          <section id="hero" className="pt-5 pb-10 md:pt-7 md:pb-14">
            <div className="mx-auto grid w-full max-w-[1240px] items-start gap-6 md:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-12">
              <div className="relative aspect-[16/10] overflow-hidden bg-b-inset md:rounded-xl">
                <Image
                  src={vehicle.image}
                  alt={vehicleName}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 640px"
                  // 90 n'est pas dans `images.qualities` : Next le
                  // ramenait silencieusement à 75, et une URL q=90
                  // forgée renvoie un 400. On écrit ce qui est servi.
                  quality={75}
                  className="object-cover"
                  data-testid="img-vehicle-hero"
                />
              </div>

              <div className="px-5 md:px-0">
                <h1 className="mb-5 md:mb-7">
                  <span className="mb-3 flex items-center gap-3">
                    <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-b-sand" aria-hidden>
                      <BrandIcon iconSvg={dv.brand?.icon_svg ?? null} iconName={dv.brand?.icon_simple ?? null} className="size-6" />
                    </span>
                    <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted-foreground md:text-sm">{vehicle.brand}</span>
                  </span>
                  <span className="block font-heading text-4xl font-semibold leading-[1.04] tracking-[-0.04em] md:text-[56px] md:leading-[1.02]">{vehicle.model}</span>
                </h1>
                {/* Le modèle reste en ligne à dessein : quelqu'un qui possède
                    déjà une voiture retirée de la vente est précisément celui
                    qui cherche une borne compatible. Le badge informe, il
                    n'écarte pas. */}
                {vehicle.isAvailable === false && (
                  <span className="-mt-2 mb-5 inline-flex h-7 items-center rounded-md border bg-card px-2.5 text-[13px] font-semibold text-muted-foreground">
                    {d("common.vehicle.discontinued")}
                  </span>
                )}
                {description && (
                  <p className="mb-6 text-base leading-relaxed text-muted-foreground">{description}</p>
                )}

                <h2 className="type-label mb-3 tracking-[0.1em] text-muted-foreground">{d("pages.vehicle.sections.keySpecs")}</h2>
                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                  {[
                    { key: "battery", value: vehicle.batteryDisplay },
                    { key: "range", value: vehicle.rangeDisplay },
                    { key: "dcCharge", value: dcMaxPower ? fmtField(dcMaxPower) : vehicle.chargingDisplay },
                    // AC power decides the home charger: highlighted.
                    { key: "acPower", value: acPower ? fmtField(acPower) : "-", highlight: true },
                    { key: "efficiency", value: vehicle.efficiencyDisplay },
                    { key: "pricePerRange", value: vehicle.pricePerRangeDisplay },
                  ].map((spec) => (
                    <div key={spec.key} className={`min-w-0 p-3.5 md:p-4.5 ${spec.highlight ? "bg-[color-mix(in_srgb,var(--b-charge)_10%,var(--card))]" : "bg-card"}`}>
                      <dt className="mb-2 min-w-0 text-[13px] leading-snug text-muted-foreground [overflow-wrap:anywhere] md:text-sm">
                        <InfoTooltip content={d(`pages.vehicle.tooltips.${spec.key}`)}>{d(`pages.vehicle.specs.${spec.key}`)}</InfoTooltip>
                      </dt>
                      <dd className="font-heading text-[22px] font-semibold leading-none tracking-[-0.03em] md:text-[28px]">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </section>

          {/* Intro + mini-quote */}
          <section className="pb-6 md:pb-10">
            <div className="mx-auto grid w-full max-w-[1240px] items-stretch gap-8 px-5 md:px-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-12">
              <div className="order-2 lg:order-1">
                {seoIntro && (
                  <div className="mb-6">
                    <h2 className="mb-4 font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{seoIntro.title}</h2>
                    <p className="mb-4 max-w-[680px] text-[17px] leading-[1.7] text-foreground/85 md:text-lg">{seoIntro.text}</p>
                    {seoIntro.text2 && (
                      <p className="max-w-[680px] text-[17px] leading-[1.7] text-foreground/85 md:text-lg">{seoIntro.text2}</p>
                    )}
                  </div>
                )}
                <a href="#charging-advice" className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-b-link hover:underline">
                  {d("pages.vehicle.cta.discoverMore")}
                  <ChevronDown className="size-4" />
                </a>
              </div>

              <aside className="order-1 self-start lg:order-2 lg:sticky lg:top-22 [--card:var(--b-sand)] [--border:transparent] [--primary:var(--b-forest)] [--primary-foreground:var(--b-on-forest)] [&>*]:rounded-xl [&>*]:shadow-none">
                <MiniQuoteCard
                  pageId="vehicle"
                  dictionary={dictionary}
                  pageRegistry={registry}
                  lang={lang}
                  interpolationValues={{ model: vehicle.model, brand: vehicle.brand }}
                />
              </aside>
            </div>
          </section>

          {/* SEO: Charging advice */}
          <div id="charging-advice" className="scroll-mt-20">
          {seoAdvice && (
            <VehicleSeoAdvice
              title={seoAdvice.title}
              intro={seoAdvice.intro}
              items={seoAdvice.items}
              recommendedLabel={d("pages.vehicle.advice.recommendedLabel")}
              eyebrow={d("pages.vehicle.sections.homeCharging")}
              aside={acPower ? <>{d("pages.vehicle.specs.acPower")} : <strong className="text-foreground">{fmtField(acPower)}</strong></> : undefined}
            />
          )}
          </div>

          {/* SEO: Cost estimate */}
          <div id="charging-cost" className="scroll-mt-20">
          {seoCost && (
            <VehicleSeoCost
              data={seoCost}
              colLabels={{
                homeChargingTitle: d("pages.vehicle.cost.homeChargingTitle"),
                homeChargingIntro: d("pages.vehicle.cost.homeChargingIntro"),
                inputsSubtitle: d("pages.vehicle.cost.subtitle"),
                inputsLabel: d("pages.vehicle.cost.inputsLabel"),
                scenario: d("pages.vehicle.cost.colScenario"),
                kwh: d("pages.vehicle.cost.colKwh"),
                kwhSolar: d("pages.vehicle.cost.colKwhSolar"),
                kwhNetwork: d("pages.vehicle.cost.colKwhNetwork"),
                cost: d("pages.vehicle.cost.colCost"),
                tariffLabel: d("pages.vehicle.cost.tariffLabel"),
                tariffUnit: d("pages.vehicle.cost.tariffUnit"),
                dailyKmLabel: d("pages.vehicle.cost.dailyKmLabel"),
                dailyKmUnit: d("pages.vehicle.cost.dailyKmUnit"),
                fuelPriceLabel: d("pages.vehicle.cost.fuelPriceLabel"),
                fuelPriceUnit: d("pages.vehicle.cost.fuelPriceUnit"),
                fuelConsumptionLabel: d("pages.vehicle.cost.fuelConsumptionLabel"),
                fuelConsumptionUnit: d("pages.vehicle.cost.fuelConsumptionUnit"),
                savingsTitle: d("pages.vehicle.cost.savingsTitle"),
                savingsInputsLabel: d("pages.vehicle.cost.savingsInputsLabel"),
                savingsCardLabel: d("pages.vehicle.cost.savingsCardLabel"),
                savingsPerMonth: d("pages.vehicle.cost.savingsPerMonth"),
                savingsPerYear: d("pages.vehicle.cost.savingsPerYear"),
                vsPetrol: d("pages.vehicle.cost.vsPetrol"),
                vsEv: d("pages.vehicle.cost.vsEv"),
                networkTitle: d("pages.vehicle.cost.networkTitle"),
                networkHome: d("pages.vehicle.cost.networkHome"),
                networkHomeDesc: d("pages.vehicle.cost.networkHomeDesc"),
                networkPublicAc: d("pages.vehicle.cost.networkPublicAc"),
                networkPublicAcDesc: d("pages.vehicle.cost.networkPublicAcDesc"),
                networkPublicDc: d("pages.vehicle.cost.networkPublicDc"),
                networkPublicDcDesc: d("pages.vehicle.cost.networkPublicDcDesc"),
                networkSavingsVsPublic: d("pages.vehicle.cost.networkSavingsVsPublic"),
                networkIntro: d("pages.vehicle.cost.networkIntro"),
                savingsIntro: d("pages.vehicle.cost.savingsIntro"),
                savingsLabel: d("pages.vehicle.cost.savingsLabel"),
                lossLabel: d("pages.vehicle.cost.lossLabel"),
                solarLabel: d("pages.vehicle.cost.solarLabel"),
                solarUnit: d("pages.vehicle.cost.solarUnit"),
              }}
            />
          )}
          </div>

          {/* SECTION 3: Fast Charging + Smart Charging */}
          {(fastChargingData || plugCharge || v2x) && (
            <section id="charging-features" className="scroll-mt-20 py-14 md:py-20">
              <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
                  <h2 className="mb-3 font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{d("pages.vehicle.sections.chargingFeatures", { brand: vehicle.brand, model: vehicle.model })}</h2>
                  {seoChargingFeatures && (
                    <p className="mb-7 max-w-[45rem] text-[17px] leading-relaxed text-muted-foreground">{seoChargingFeatures}</p>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6">
                    {fastChargingData && (
                      <div className="rounded-xl bg-b-sand p-6 md:p-7">
                        <h3 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold leading-snug">
                          <BatteryCharging className="size-5 text-b-link" />
                          {d("pages.vehicle.sections.dcFastCharging")}
                        </h3>
                        <div className="space-y-1">
                          <SpecRow icon={Plug} label={d("pages.vehicle.fastCharging.port")} value={safeStr(dcPort)} tooltip={d("pages.vehicle.tooltips.dcPort")} />
                          <SpecRow icon={Zap} label={d("pages.vehicle.fastCharging.maxPower")} value={dcMaxPower ? fmtField(dcMaxPower) : "-"} tooltip={d("pages.vehicle.tooltips.dcMaxPower")} />
                          <SpecRow icon={Gauge} label={d("pages.vehicle.fastCharging.avgPower")} value={dcAvgPower ? fmtField(dcAvgPower) : "-"} tooltip={d("pages.vehicle.tooltips.dcAvgPower")} />
                          <SpecRow
                            icon={Clock}
                            label={d("pages.vehicle.fastCharging.time")}
                            value={dcTime?.value ? `${dcTime.value} ${dcTime.unit || "min"}${dcTime.range ? ` (${dcTime.range.from?.value || "?"}${dcTime.range.from?.unit || ""} → ${dcTime.range.to?.value || "?"}${dcTime.range.to?.unit || ""})` : ""}` : "-"}
                            tooltip={d("pages.vehicle.tooltips.dcTime")}
                          />
                          <SpecRow icon={Rocket} label={d("pages.vehicle.fastCharging.speed")} value={dcSpeed ? fmtField(dcSpeed) : "-"} tooltip={d("pages.vehicle.tooltips.dcSpeed")} />
                          {batteryPreconditioning && (
                            <div className="flex justify-between items-start sm:items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Thermometer className="h-4 w-4 shrink-0" />
                                <InfoTooltip content={d("pages.vehicle.tooltips.preconditioning")}>{d("pages.vehicle.fastCharging.preconditioningShort")}</InfoTooltip>
                              </span>
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                {batteryPreconditioning.precond_possible && batteryPreconditioning.auto_using_navigation && (
                                  <span className="text-xs text-muted-foreground">{d("pages.vehicle.fastCharging.preconditioningAutoUsingNav")}</span>
                                )}
                                <BooleanBadge supported={batteryPreconditioning.precond_possible} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {(plugCharge || autocharge != null || v2x) && (
                      <div className="rounded-xl bg-b-sand p-6 md:p-7">
                        <h3 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold leading-snug">
                          <Zap className="size-5 text-b-link" />
                          {d("pages.vehicle.sections.smartCharging")}
                        </h3>
                        <div className="space-y-1">
                          {plugCharge && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Plug className="h-4 w-4 shrink-0" />
                                <InfoTooltip content={d("pages.vehicle.tooltips.plugCharge")}>{d("pages.vehicle.smartCharging.plugCharge")}</InfoTooltip>
                              </span>
                              <div className="flex items-center gap-2">
                                {plugCharge.supported_protocol && <span className="text-xs text-muted-foreground">{safeStr(plugCharge.supported_protocol)}</span>}
                                <BooleanBadge supported={plugCharge.plug_charge_supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                              </div>
                            </div>
                          )}
                          {autocharge != null && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Wifi className="h-4 w-4 shrink-0" />
                                <InfoTooltip content={d("pages.vehicle.tooltips.autocharge")}>{d("pages.vehicle.smartCharging.autocharge")}</InfoTooltip>
                              </span>
                              <BooleanBadge supported={autocharge} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                            </div>
                          )}
                          {v2x && (
                            <>
                              <div className="py-3"><Separator /></div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><PlugZap className="h-4 w-4 shrink-0" /><InfoTooltip content={d("pages.vehicle.tooltips.v2l")}>{d("pages.vehicle.smartCharging.v2lShort")}</InfoTooltip></span>
                                <div className="flex items-center gap-2">
                                  {v2x.vehicle_to_load?.supported && v2x.vehicle_to_load?.max_output_power && (
                                    <span className="text-xs text-muted-foreground">{v2x.vehicle_to_load.max_output_power.value} {v2x.vehicle_to_load.max_output_power.unit}</span>
                                  )}
                                  <BooleanBadge supported={v2x.vehicle_to_load?.supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Home className="h-4 w-4 shrink-0" /><InfoTooltip content={d("pages.vehicle.tooltips.v2h")}>{d("pages.vehicle.smartCharging.v2hShort")}</InfoTooltip></span>
                                <div className="flex items-center gap-2">
                                  {(v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported) && (v2x.vehicle_to_home?.ac_max_output_power || v2x.vehicle_to_home?.dc_max_output_power) && (
                                    <span className="text-xs text-muted-foreground">{fmtField(v2x.vehicle_to_home.ac_max_output_power || v2x.vehicle_to_home.dc_max_output_power)}</span>
                                  )}
                                  <BooleanBadge supported={v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Network className="h-4 w-4 shrink-0" /><InfoTooltip content={d("pages.vehicle.tooltips.v2g")}>{d("pages.vehicle.smartCharging.v2gShort")}</InfoTooltip></span>
                                <div className="flex items-center gap-2">
                                  {(v2x.vehicle_to_grid?.ac_supported || v2x.vehicle_to_grid?.dc_supported) && (v2x.vehicle_to_grid?.ac_max_output_power || v2x.vehicle_to_grid?.dc_max_output_power) && (
                                    <span className="text-xs text-muted-foreground">{fmtField(v2x.vehicle_to_grid.ac_max_output_power || v2x.vehicle_to_grid.dc_max_output_power)}</span>
                                  )}
                                  <BooleanBadge supported={v2x.vehicle_to_grid?.ac_supported || v2x.vehicle_to_grid?.dc_supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </section>
          )}

          {/* SECTION 4: Real World Range */}
          <div id="real-range" className="scroll-mt-20">
          {realRange && (coldCombined || mildCombined) && (
            <VehicleDetailClient
              dictionary={dictionary}
              brand={vehicle.brand}
              model={vehicle.model}
              lang={lang}
              intro={seoRealRange ?? undefined}
              realRange={realRange}
              coldCity={coldCity}
              coldHighway={coldHighway}
              coldCombined={coldCombined}
              mildCity={mildCity}
              mildHighway={mildHighway}
              mildCombined={mildCombined}
              realRangeMin={realRangeMin}
              realRangeMax={realRangeMax}
            />
          )}
          </div>

          {/* SECTION 5: Battery + Performance + Dimensions */}
          {(batteryDetails || perf || dims) && (
            <section id="tech-specs" className="scroll-mt-20 py-14 md:py-20">
              <div className="mx-auto w-full max-w-[1240px] px-5 md:px-10">
                  <h2 className="mb-3 font-heading text-[26px] font-semibold leading-[1.15] tracking-[-0.03em] md:text-[32px]">{d("pages.vehicle.sections.techSpecsOf", { brand: vehicle.brand, model: vehicle.model })}</h2>
                  {seoTechSpecs && (
                    <p className="mb-7 max-w-[45rem] text-[17px] leading-relaxed text-muted-foreground">{seoTechSpecs}</p>
                  )}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
                    {batteryDetails && (
                      <div className="rounded-xl bg-b-sand p-6 md:p-7">
                        <h3 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold leading-snug"><Battery className="size-5 text-b-link" />{d("pages.vehicle.techSpecs.battery")}</h3>
                        <div className="space-y-1">
                          {batteryDetails.nominal_capacity && <SpecRow icon={BatteryFull} label={d("pages.vehicle.techSpecs.nominalCapacity")} value={fmtField(batteryDetails.nominal_capacity)} tooltip={d("pages.vehicle.tooltips.nominalCapacity")} />}
                          {batteryDetails.useable_capacity && <SpecRow icon={BatteryMedium} label={d("pages.vehicle.techSpecs.useableCapacity")} value={fmtField(batteryDetails.useable_capacity)} tooltip={d("pages.vehicle.tooltips.useableCapacity")} />}
                          {(batteryDetails.type || batteryDetails.battery_type) && <SpecRow icon={FlaskConical} label={d("pages.vehicle.techSpecs.type")} value={safeStr(batteryDetails.type || batteryDetails.battery_type)} tooltip={d("pages.vehicle.tooltips.batteryType")} />}
                          {batteryDetails.architecture && <SpecRow icon={Layers} label={d("pages.vehicle.techSpecs.architecture")} value={fmtField(batteryDetails.architecture)} tooltip={d("pages.vehicle.tooltips.batteryArchitecture")} />}
                          {(batteryDetails.warranty_period || batteryDetails.warranty_mileage) && (
                            <SpecRow icon={ShieldCheck} label={d("pages.vehicle.techSpecs.warranty")} value={[batteryDetails.warranty_period ? fmtField(batteryDetails.warranty_period) : null, batteryDetails.warranty_mileage ? fmtField(batteryDetails.warranty_mileage) : null].filter(Boolean).join(" / ")} />
                          )}
                        </div>
                      </div>
                    )}
                    {perf && (
                      <div className="rounded-xl bg-b-sand p-6 md:p-7">
                        <h3 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold leading-snug"><Rocket className="size-5 text-b-link" />{d("pages.vehicle.techSpecs.performance")}</h3>
                        <div className="space-y-1">
                          {perf.acceleration_0_100 && <SpecRow icon={Timer} label={d("pages.vehicle.techSpecs.acceleration")} value={fmtField(perf.acceleration_0_100)} tooltip={d("pages.vehicle.tooltips.acceleration")} />}
                          {perf.top_speed && <SpecRow icon={Gauge} label={d("pages.vehicle.techSpecs.topSpeed")} value={fmtField(perf.top_speed)} />}
                          {perf.power?.ps && <SpecRow icon={Zap} label={d("pages.vehicle.techSpecs.powerPs")} value={fmtField(perf.power.ps)} />}
                          {perf.torque && <SpecRow icon={RotateCcw} label={d("pages.vehicle.techSpecs.torque")} value={fmtField(perf.torque)} tooltip={d("pages.vehicle.tooltips.torque")} />}
                          {perf.drive_type && <SpecRow icon={Car} label={d("pages.vehicle.techSpecs.driveType")} value={safeStr(perf.drive_type)} tooltip={d("pages.vehicle.tooltips.driveType")} />}
                        </div>
                      </div>
                    )}
                    {dims && (
                      <div className="rounded-xl bg-b-sand p-6 md:p-7">
                        <h3 className="mb-4 flex items-center gap-2.5 text-[17px] font-semibold leading-snug"><Ruler className="size-5 text-b-link" />{d("pages.vehicle.techSpecs.dimensions")}</h3>
                        <div className="space-y-1">
                          {(dims.length || dims.width || dims.height) && (() => {
                            const toM = (v: number | undefined) => v ? (v / 1000).toFixed(2) : null;
                            const vals = [toM(dims.length?.value), toM(dims.width?.value), toM(dims.height?.value)].filter(Boolean);
                            return <SpecRow icon={Maximize2} label={d("pages.vehicle.techSpecs.lxwxh")} value={vals.join(" x ") + " m"} />;
                          })()}
                          {dims.wheelbase && <SpecRow icon={ArrowLeftRight} label={d("pages.vehicle.techSpecs.wheelbase")} value={dims.wheelbase?.value ? `${(dims.wheelbase.value / 1000).toFixed(2)} m` : fmtField(dims.wheelbase)} tooltip={d("pages.vehicle.tooltips.wheelbase")} />}
                          {(dims.weight_unladen_eu || dims.weight) && <SpecRow icon={Scale} label={d("pages.vehicle.techSpecs.weight")} value={fmtField(dims.weight_unladen_eu || dims.weight)} />}
                          {dims.cargo_volume && <SpecRow icon={Package} label={d("pages.vehicle.techSpecs.cargo")} value={fmtField(dims.cargo_volume)} />}
                          {dims.seats && <SpecRow icon={Users} label={d("pages.vehicle.techSpecs.seats")} value={fmtField(dims.seats)} />}
                          {dims.tow_hitch_possible != null && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Truck className="h-4 w-4 shrink-0" /><InfoTooltip content={d("pages.vehicle.tooltips.towingWeight")}>{d("pages.vehicle.techSpecs.towHitch")}</InfoTooltip></span>
                              <div className="flex items-center gap-2">
                                {dims.tow_hitch_possible && dims.towing_weight_braked && <span className="text-xs text-muted-foreground">{fmtField(dims.towing_weight_braked)}</span>}
                                <BooleanBadge supported={dims.tow_hitch_possible} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </section>
          )}

          {/* SEO: FAQ */}
          <div id="faq" className="scroll-mt-20">
          {seoFaq && seoFaq.items.length > 0 && (
            <VehicleSeoFAQ
              title={seoFaq.title}
              intro={seoFaq.intro}
              items={seoFaq.items}
            />
          )}
          </div>

          {/* Internal linking */}
          <RelatedContent
            sameBrand={sameBrandVehicles}
            similar={similarVehicles}
            featuredPosts={featuredPosts}
            lang={lang}
            pageRegistry={registry}
            strings={{
              sectionTitle: d("pages.vehicle.related.sectionTitle"),
              sameBrand: d("pages.vehicle.related.sameBrand"),
              similar: d("pages.vehicle.related.similar"),
              featuredPosts: d("pages.vehicle.related.featuredPosts"),
              range: d("pages.vehicle.specs.range"),
              homeCharging: d("pages.vehicle.sections.homeCharging"),
            }}
            brandName={brandName}
            modelName={vehicle.model}
          />

          {/* GetQuote CTA */}
          {hasGetQuoteBlock && (
            <div className="py-10">
              <CtaB
                title={d("pages.vehicle.blocks.getquote.headline", { brand: vehicle.brand, model: vehicle.model })}
                subtitle={d("pages.vehicle.blocks.getquote.subheadline", { brand: vehicle.brand, model: vehicle.model })}
                primary={{ label: d("pages.vehicle.blocks.getquote.cta.label", { brand: vehicle.brand, model: vehicle.model }), href: quoteHref }}
                note={d("pages.vehicle.blocks.getquote.note", { brand: vehicle.brand, model: vehicle.model })}
              />
            </div>
          )}
        </div>
      </>
    );
  }

  // Vehicle brands listing
  if (route.type === "vehicle-brands") {
    const [rawBrands, rawVehicles, { dict: dictionary }, brandPageResult, registry] = await Promise.all([
      fetchVehicleBrands(locale),
      fetchVehicles(locale),
      buildDictionary("vehicles"),
      fetchPage("vehicle-brands", locale),
      fetchPageRegistry(),
    ]);

    // Merge vehicle-brands page dictionary if available
    if (brandPageResult) {
      const brandPageDict = extractPageDictionary("vehicle-brands", brandPageResult, locale);
      Object.assign(dictionary, brandPageDict);
    }

    // Compute active vehicles and brand counts (matches source logic)
    const currentYear = new Date().getFullYear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeVehicles = (rawVehicles || []).filter((v: any) => {
      const activeTo = v.active_to ?? v.activeTo;
      return activeTo === currentYear || activeTo === null || activeTo === undefined;
    });

    const generateBrandSlug = (name: string) =>
      name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandsWithCounts = (rawBrands || []).map((brand: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vehicleCount = activeVehicles.filter((v: any) => v.brand?.id === brand.id).length;
      return {
        id: brand.id,
        name: brand.name || "",
        slug: brand.slug || generateBrandSlug(brand.name || ""),
        icon_simple: brand.icon_simple,
        icon_svg: brand.icon_svg || null,
        vehicleCount,
      };
    })
    .filter((b: { vehicleCount: number }) => b.vehicleCount > 0)
    .sort((a: { vehicleCount: number }, b: { vehicleCount: number }) => b.vehicleCount - a.vehicleCount);

    // Extract hero block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = brandPageResult?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroTranslation = heroBlock?.translations?.[0];
    const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;

    // Extract getquote block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = brandPageResult?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const tPrefix = "pages.vehicle-brands";
    const quoteEntry = registry.find((p) => p.id === "quote");
    const quoteSlug = quoteEntry?.slugs[lang];
    const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;

    const getQuoteData = getQuoteBlock ? {
      headline: t(dictionary, `${tPrefix}.blocks.getquote.headline`),
      subheadline: t(dictionary, `${tPrefix}.blocks.getquote.subheadline`),
      ctaLabel: t(dictionary, `${tPrefix}.blocks.getquote.cta.label`),
      ctaHref,
      note: t(dictionary, `${tPrefix}.blocks.getquote.note`),
      variant: getQuoteBlock.variant === "green" ? "primary" as const : "muted" as const,
      image: getQuoteBlock.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined,
    } : undefined;

    return (
      <VehicleBrandsListView
        brandsWithCounts={brandsWithCounts}
        lang={lang}
        vehiclesSegment={slug}
        brandsSegment={brandsSegment}
        dictionary={dictionary}
        heroTitle={heroTranslation?.headline || t(dictionary, `${tPrefix}.blocks.hero.headline`)}
        heroSubtitle={(heroTranslation?.subheadline || t(dictionary, `${tPrefix}.blocks.hero.subheadline`)).replace(/\{count\}/g, String(brandsWithCounts.length))}
        heroImage={heroImage}
        getQuoteBlock={getQuoteData}
      />
    );
  }

  // Quote success
  if (route.type === "quote-success") {
    const pageIds = successPageIds(route.product);
    const [pages, layoutData, registry] = await Promise.all([
      Promise.all(pageIds.map((id) => fetchPage(id, locale))),
      fetchLayout(locale),
      fetchPageRegistry(),
    ]);
    // Charger page first, product page last: the product's own copy wins.
    const dictionary: Record<string, string> = Object.assign(
      {},
      ...pages.map((p, i) => (p ? extractPageDictionary(pageIds[i], p, locale) : {})).reverse(),
    );
    // Hero and CTAs come from the most specific page that exists.
    const quotePage = pages.find(Boolean);

    // Extract hero block data
    const heroBlock = quotePage?.blocks?.find(
      (b: any) => b?.collection === "block_hero",
    )?.item;
    const heroImageUrl = heroBlock?.image
      ? `${DIRECTUS_URL}/assets/${heroBlock.image}`
      : undefined;
    const ctas: Array<{
      label?: string;
      type?: string;
      variant?: string;
      page_route_id?: string;
    }> = heroBlock?.translations?.[0]?.ctas ?? [];

    // SLA vars from global config
    const gc = layoutData?.global_config ?? {};
    const slas = gc?.slas ?? {};
    const firstContact = slas?.first_contact?.value ?? 48;
    const deliveryTimeline =
      slas?.quote_delivery_timeline?.value ?? "3-5";

    // Google Ads lead conversion — fallback signal only: the primary fire
    // happens in QuoteForm at submit time (with enhanced-conversion user
    // data); this one covers lost beacons and shares the transaction_id so
    // Google dedupes. Inert unless tag_id + quote_submit label are set.
    const googleAds = gc?.google_ads ?? {};
    const adsConversionSendTo = adsSendTo(googleAds, "quote_submit", route.product);

    return (
      <Suspense>
        <GoogleAdsConversion sendTo={adsConversionSendTo} />
        <OpenAIConversion />
        <QuoteSuccessClient
          lang={lang}
          dictionary={dictionary}
          heroImageUrl={heroImageUrl}
          ctas={ctas}
          slaVars={{
            first_contact: firstContact,
            quote_delivery_timeline: deliveryTimeline,
          }}
          quoteSlug={slug}
          pageRegistry={registry}
          product={route.product}
          dictPageIds={pageIds}
        />
      </Suspense>
    );
  }

  // Quote submission view
  if (route.type === "quote-submission") {
    // Partner links always use the charger slug; the view picks its sections
    // from submission.product, so both products' copy is loaded.
    const formIds = ["quote", "quote-battery"];
    const viewIds = [...viewPageIds("battery")].reverse(); // quote-view, then quote-battery-view
    const [formPages, viewPages, layoutData] = await Promise.all([
      Promise.all(formIds.map((id) => fetchPage(id, locale))),
      Promise.all(viewIds.map((id) => fetchPage(id, locale))),
      fetchLayout(locale),
    ]);
    const dictionary: Record<string, string> = Object.assign(
      {},
      ...formPages.map((p, i) => (p ? extractPageDictionary(formIds[i], p, locale) : {})),
      ...viewPages.map((p, i) => (p ? extractPageDictionary(viewIds[i], p, locale) : {})),
    );
    const quotePage = formPages[0];

    const logoColorUrl = layoutData?.logo_color
      ? `${DIRECTUS_URL}/assets/${layoutData.logo_color}`
      : "/logo-color.svg";
    const logoWhiteUrl = layoutData?.logo_white
      ? `${DIRECTUS_URL}/assets/${layoutData.logo_white}`
      : "/logo-white.svg";

    return (
      <Suspense>
        <QuoteSubmissionViewClient
          lang={lang}
          submissionId={route.submissionId}
          dictionary={dictionary}
          quoteConfig={quotePage?.config || {}}
          logoColorUrl={logoColorUrl}
          logoWhiteUrl={logoWhiteUrl}
          directusUrl={DIRECTUS_URL}
        />
      </Suspense>
    );
  }

  // Blog category listing: /{lang}/{blogSlug}/{categorySlug}
  if (route.type === "blog-listing") {
    // Redirect to the main blog page — category filtering handled there
    const { redirect } = await import("next/navigation");
    redirect(`/${lang}/${slug}`);
  }

  if (route.type === "locality-redirect") {
    const { permanentRedirect } = await import("next/navigation");
    const subsidiesSegment = getRouteSlug(lang, "subsidies");
    permanentRedirect(`/${lang}/${slug}/${route.localitySlug}/${subsidiesSegment}`);
  }

  notFound();
}
