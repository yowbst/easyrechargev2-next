import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isValidLang, slugToDirectusLocale, getRouteSlug } from "@/lib/i18n/config";
import { resolveSub1Route } from "@/lib/route-resolver";
import {
  fetchVehicle,
  fetchVehicleBrands,
  fetchVehicles,
  fetchLayout,
  fetchPage,
  fetchPageRegistry,
} from "@/lib/directus-queries";
import { extractLayoutDictionary, extractPageDictionary, t } from "@/lib/i18n/dictionaries";
import { VehicleBrandsListView } from "@/lib/vehicles/shared";
import { transformDirectusVehicle, formatMinutes } from "@/lib/vehicleTransformer";
import { DIRECTUS_URL } from "@/lib/directus";
import { cmsImage } from "@/lib/directusAssets";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  resolveImageUrl,
  buildAlternates,
  getSiteUrl,
} from "@/lib/seo/resolver";
import { wrapInGraph, buildVehicleProduct, buildBreadcrumbList } from "@/lib/seo/jsonLd";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { VehicleDetailClient } from "@/components/VehicleDetailClient";
import { GetQuote } from "@/components/GetQuote";
import { QuoteSuccess as QuoteSuccessClient } from "@/components/quote/QuoteSuccess";
import { QuoteSubmissionView as QuoteSubmissionViewClient } from "@/components/quote/QuoteSubmissionView";
import {
  ArrowLeft,
  CheckCircle,
  Battery,
  Car,
  Zap,
  Plug,
  Gauge,
  BadgeDollarSign,
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
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        {Icon && <Icon className="h-4 w-4" />}
        {label}
      </span>
      <span className="font-medium text-sm">{value ?? "-"}</span>
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

  if (route.type === "vehicle-detail") {
    const locale = slugToDirectusLocale(lang);
    const directusVehicle = await fetchVehicle(route.slug, locale);
    if (!directusVehicle) return {};

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) return {};

    const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");

    return buildMetadata({
      title: normalizeTitle(vehicleName),
      description: truncate(
        [vehicleName, vehicle.batteryDisplay, vehicle.rangeDisplay, vehicle.chargingDisplay]
          .filter(Boolean)
          .join(" | "),
      ),
      canonical: `${SITE_URL}/${lang}/${slug}/${sub1}`,
      ogImage: directusVehicle.thumbnail ? resolveImageUrl(directusVehicle.thumbnail) : undefined,
      ogType: "website",
      lang,
      alternates: buildAlternates({
        [lang]: `/${lang}/${slug}/${route.slug}`,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${route.slug}`,
      }),
    });
  }

  if (route.type === "quote-success" || route.type === "quote-submission") {
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
    const [directusVehicle, { dict: dictionary, page: vehiclePage }, registry] = await Promise.all([
      fetchVehicle(route.slug, locale),
      buildDictionary("vehicle"),
      fetchPageRegistry(),
    ]);
    if (!directusVehicle) notFound();

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) notFound();

    const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);
    const df = (key: string, fallback: string, vars?: Record<string, string | number>) => {
      const val = t(dictionary, key, vars);
      return val === key ? fallback : val;
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

    // JSON-LD
    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}`;
    const absoluteImage = dv.thumbnail
      ? (resolveImageUrl(dv.thumbnail) || `${SITE_URL}/og-default.webp`)
      : `${SITE_URL}/og-default.webp`;

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: d("common.home"), url: `${SITE_URL}/${lang}` },
        { name: df("pages.vehicle.breadcrumb.vehicles", lang === "de" ? "Fahrzeuge" : "Vehicules"), url: `${SITE_URL}/${lang}/${slug}` },
        { name: brandName, url: `${SITE_URL}/${lang}/${slug}/${brandsSegment}/${brandSlug}` },
        { name: vehicleName, url: `${SITE_URL}${currentPath}` },
      ]),
      buildVehicleProduct({
        name: vehicleName,
        brand: vehicle.brand,
        description: description || `${vehicleName} - EV charging specifications`,
        imageUrl: absoluteImage,
        url: `${SITE_URL}${currentPath}`,
        batteryCapacity: vehicle.batteryDisplay,
        rangeKm: vehicle.rangeDisplay,
      }),
    );

    // GetQuote block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = vehiclePage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const hasGetQuoteBlock = !!getQuoteBlock?.translations?.[0];
    const getQuoteVariant = getQuoteBlock?.variant === "green" ? "primary" : "muted";
    const getQuoteImage = getQuoteBlock?.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined;
    const quotePage = registry.find((p) => p.id === "quote");
    const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        {/* Back Button */}
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container mx-auto px-4 py-3">
            <Link
              href={`/${lang}/${slug}/${brandsSegment}/${brandSlug}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {df("pages.vehicle.subheader.back", brandName, { brand: brandName })}
            </Link>
          </div>
        </nav>

        <div className="flex-1">
          {/* SECTION 1: Hero + Key Specs + Sidebar */}
          <section className="py-12">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-8">
                    <div className="aspect-video overflow-hidden rounded-2xl mb-6 relative bg-muted/20">
                      <img
                        {...cmsImage(vehicle.image, [400, 800], { quality: 85 })}
                        alt={vehicleName}
                        width={800}
                        height={450}
                        className="w-full h-full object-cover"
                        data-testid="img-vehicle-hero"
                      />
                    </div>

                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary">{vehicle.brand}</Badge>
                    </div>
                    <h1 className="text-4xl font-heading font-bold mb-4">{vehicle.model}</h1>

                    {description && (
                      <p className="text-lg text-muted-foreground mb-8">{description}</p>
                    )}

                    {/* 6 Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Battery className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.battery")}</span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.batteryDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Car className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.range")}</span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.rangeDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.dcCharge")}</span>
                        </div>
                        <div className="text-2xl font-bold">{dcMaxPower ? fmtField(dcMaxPower) : vehicle.chargingDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Plug className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.acPower")}</span>
                        </div>
                        <div className="text-2xl font-bold">{acPower ? fmtField(acPower) : "-"}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Gauge className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.efficiency")}</span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.efficiencyDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BadgeDollarSign className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">{d("pages.vehicle.specs.pricePerRange")}</span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.pricePerRangeDisplay}</div>
                      </Card>
                    </div>
                  </div>

                  {/* Sidebar */}
                  <aside className="lg:col-span-4">
                    <div className="lg:sticky lg:top-24 space-y-5">
                      <MiniQuoteCard
                        pageId="vehicle"
                        dictionary={dictionary}
                        pageRegistry={registry}
                        lang={lang}
                        interpolationValues={{ model: vehicle.model, brand: vehicle.brand }}
                      />
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2: HOME CHARGING */}
          <section className="py-12 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <h2 className="text-3xl font-heading font-bold mb-8">{d("pages.vehicle.sections.homeCharging")}</h2>

                {homeChargingDetails.length > 0 && (
                  <Card className="overflow-hidden mb-6">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{d("pages.vehicle.homeCharging.table.chargingPoint.name")}</TableHead>
                          <TableHead>{d("pages.vehicle.homeCharging.table.power")}</TableHead>
                          <TableHead>{d("pages.vehicle.homeCharging.table.time")}</TableHead>
                          <TableHead className="text-right">{d("pages.vehicle.homeCharging.table.speed")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          const hasOptional = homeChargingDetails.some((r) => String(r.charging_point || "").startsWith("optional-"));
                          const optionalIndex = hasOptional
                            ? homeChargingDetails.findIndex((r) => String(r.charging_point || "").startsWith("optional-"))
                            : -1;
                          const summaryRow = (
                            <TableRow key="summary" className="bg-primary/10 font-semibold text-base hover:bg-primary/10">
                              <TableCell>{d("pages.vehicle.homeCharging.summary")}</TableCell>
                              <TableCell>{acPower ? fmtField(acPower) : "-"}</TableCell>
                              <TableCell>{homeCharging?.charge_time?.value ? formatMinutes(homeCharging.charge_time.value) : "-"}</TableCell>
                              <TableCell className="text-right">{homeCharging?.charge_speed ? fmtField(homeCharging.charge_speed) : "-"}</TableCell>
                            </TableRow>
                          );
                          const rows: React.ReactNode[] = [];
                          homeChargingDetails.forEach((row, i) => {
                            const cp = String(row.charging_point || "");
                            const isSubcategory = cp.startsWith("standard-") || cp.startsWith("optional-");
                            if (hasOptional && i === optionalIndex) {
                              rows.push(summaryRow);
                              rows.push(<TableRow key="spacer" className="hover:bg-transparent"><TableCell colSpan={4} className="p-0 h-4" /></TableRow>);
                            }
                            if (isSubcategory) {
                              rows.push(<TableRow key={i} className="bg-muted/40"><TableCell colSpan={4} className="font-semibold text-sm py-2">{d(`pages.vehicle.homeCharging.table.chargingPoint.values.${cp}`)}</TableCell></TableRow>);
                              return;
                            }
                            const isLimited = row.is_limited || row.limited;
                            rows.push(
                              <TableRow key={i}>
                                <TableCell className="font-medium">{d(`pages.vehicle.homeCharging.table.chargingPoint.values.${cp}`)}</TableCell>
                                <TableCell>
                                  {row.charge_power ? fmtField(row.charge_power) : "-"}
                                  {isLimited && <span className="text-muted-foreground ml-1" title={d("pages.vehicle.homeCharging.table.limitedTooltip")}>*</span>}
                                </TableCell>
                                <TableCell>{row.charge_time?.value ? formatMinutes(row.charge_time.value) : "-"}</TableCell>
                                <TableCell className="text-right">{row.charge_speed?.value ? `${row.charge_speed.value} ${row.charge_speed.unit || "km/h"}` : "-"}</TableCell>
                              </TableRow>,
                            );
                          });
                          if (!hasOptional) rows.push(summaryRow);
                          return rows;
                        })()}
                      </TableBody>
                    </Table>
                    {homeChargingDetails.some((r) => r.is_limited || r.limited) && (
                      <div className="px-4 py-2 text-xs text-muted-foreground border-t">* {d("pages.vehicle.homeCharging.table.limitedNote")}</div>
                    )}
                  </Card>
                )}
              </div>
            </div>
          </section>

          {/* SECTION 3: Fast Charging + Smart Charging */}
          {(fastChargingData || plugCharge || v2x) && (
            <section className="py-12">
              <div className="container mx-auto px-4">
                <div className="max-w-6xl mx-auto">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {fastChargingData && (
                      <Card className="p-6">
                        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                          <BatteryCharging className="h-5 w-5 text-primary" />
                          {d("pages.vehicle.sections.dcFastCharging")}
                        </h3>
                        <div className="space-y-1">
                          <SpecRow icon={Plug} label={d("pages.vehicle.fastCharging.port")} value={safeStr(dcPort)} />
                          <SpecRow icon={Zap} label={d("pages.vehicle.fastCharging.maxPower")} value={dcMaxPower ? fmtField(dcMaxPower) : "-"} />
                          <SpecRow icon={Gauge} label={d("pages.vehicle.fastCharging.avgPower")} value={dcAvgPower ? fmtField(dcAvgPower) : "-"} />
                          <SpecRow
                            icon={Clock}
                            label={d("pages.vehicle.fastCharging.time")}
                            value={dcTime?.value ? `${dcTime.value} ${dcTime.unit || "min"}${dcTime.range ? ` (${dcTime.range.from?.value || "?"}${dcTime.range.from?.unit || ""} → ${dcTime.range.to?.value || "?"}${dcTime.range.to?.unit || ""})` : ""}` : "-"}
                          />
                          <SpecRow icon={Rocket} label={d("pages.vehicle.fastCharging.speed")} value={dcSpeed ? fmtField(dcSpeed) : "-"} />
                          {batteryPreconditioning && (
                            <div className="flex justify-between items-start sm:items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Thermometer className="h-4 w-4 shrink-0" />
                                {d("pages.vehicle.fastCharging.preconditioning")}
                              </span>
                              <div className="flex flex-col-reverse items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                                {batteryPreconditioning.precond_possible && batteryPreconditioning.auto_using_navigation && (
                                  <span className="text-xs text-muted-foreground">{d("pages.vehicle.fastCharging.preconditioningAutoUsingNav")}</span>
                                )}
                                <BooleanBadge supported={batteryPreconditioning.precond_possible} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {(plugCharge || autocharge != null || v2x) && (
                      <Card className="p-6">
                        <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                          <Zap className="h-5 w-5 text-primary" />
                          {d("pages.vehicle.sections.smartCharging")}
                        </h3>
                        <div className="space-y-1">
                          {plugCharge && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Plug className="h-4 w-4 shrink-0" />
                                {d("pages.vehicle.smartCharging.plugCharge")}
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
                                {d("pages.vehicle.smartCharging.autocharge")}
                              </span>
                              <BooleanBadge supported={autocharge} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                            </div>
                          )}
                          {v2x && (
                            <>
                              <div className="py-3"><Separator /></div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><PlugZap className="h-4 w-4 shrink-0" />{d("pages.vehicle.smartCharging.v2l")}</span>
                                <div className="flex items-center gap-2">
                                  {v2x.vehicle_to_load?.supported && v2x.vehicle_to_load?.max_output_power && (
                                    <span className="text-xs text-muted-foreground">{v2x.vehicle_to_load.max_output_power.value} {v2x.vehicle_to_load.max_output_power.unit}</span>
                                  )}
                                  <BooleanBadge supported={v2x.vehicle_to_load?.supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Home className="h-4 w-4 shrink-0" />{d("pages.vehicle.smartCharging.v2h")}</span>
                                <div className="flex items-center gap-2">
                                  {(v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported) && (v2x.vehicle_to_home?.ac_max_output_power || v2x.vehicle_to_home?.dc_max_output_power) && (
                                    <span className="text-xs text-muted-foreground">{fmtField(v2x.vehicle_to_home.ac_max_output_power || v2x.vehicle_to_home.dc_max_output_power)}</span>
                                  )}
                                  <BooleanBadge supported={v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Network className="h-4 w-4 shrink-0" />{d("pages.vehicle.smartCharging.v2g")}</span>
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
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION 4: Real World Range */}
          {realRange && (coldCombined || mildCombined) && (
            <VehicleDetailClient
              dictionary={dictionary}
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

          {/* SECTION 5: Battery + Performance + Dimensions */}
          {(batteryDetails || perf || dims) && (
            <section className="py-12">
              <div className="container mx-auto px-4">
                <div className="max-w-6xl mx-auto">
                  <h2 className="text-3xl font-heading font-bold mb-8">{d("pages.vehicle.sections.techSpecs")}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {batteryDetails && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Battery className="h-5 w-5 text-primary" />{d("pages.vehicle.techSpecs.battery")}</h3>
                        <div className="space-y-1">
                          {batteryDetails.nominal_capacity && <SpecRow icon={BatteryFull} label={d("pages.vehicle.techSpecs.nominalCapacity")} value={fmtField(batteryDetails.nominal_capacity)} />}
                          {batteryDetails.useable_capacity && <SpecRow icon={BatteryMedium} label={d("pages.vehicle.techSpecs.useableCapacity")} value={fmtField(batteryDetails.useable_capacity)} />}
                          {(batteryDetails.type || batteryDetails.battery_type) && <SpecRow icon={FlaskConical} label={d("pages.vehicle.techSpecs.type")} value={safeStr(batteryDetails.type || batteryDetails.battery_type)} />}
                          {batteryDetails.architecture && <SpecRow icon={Layers} label={d("pages.vehicle.techSpecs.architecture")} value={fmtField(batteryDetails.architecture)} />}
                          {(batteryDetails.warranty_period || batteryDetails.warranty_mileage) && (
                            <SpecRow icon={ShieldCheck} label={d("pages.vehicle.techSpecs.warranty")} value={[batteryDetails.warranty_period ? fmtField(batteryDetails.warranty_period) : null, batteryDetails.warranty_mileage ? fmtField(batteryDetails.warranty_mileage) : null].filter(Boolean).join(" / ")} />
                          )}
                        </div>
                      </Card>
                    )}
                    {perf && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" />{d("pages.vehicle.techSpecs.performance")}</h3>
                        <div className="space-y-1">
                          {perf.acceleration_0_100 && <SpecRow icon={Timer} label={d("pages.vehicle.techSpecs.acceleration")} value={fmtField(perf.acceleration_0_100)} />}
                          {perf.top_speed && <SpecRow icon={Gauge} label={d("pages.vehicle.techSpecs.topSpeed")} value={fmtField(perf.top_speed)} />}
                          {perf.power?.ps && <SpecRow icon={Zap} label={d("pages.vehicle.techSpecs.powerPs")} value={fmtField(perf.power.ps)} />}
                          {perf.torque && <SpecRow icon={RotateCcw} label={d("pages.vehicle.techSpecs.torque")} value={fmtField(perf.torque)} />}
                          {perf.drive_type && <SpecRow icon={Car} label={d("pages.vehicle.techSpecs.driveType")} value={safeStr(perf.drive_type)} />}
                        </div>
                      </Card>
                    )}
                    {dims && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2"><Ruler className="h-5 w-5 text-primary" />{d("pages.vehicle.techSpecs.dimensions")}</h3>
                        <div className="space-y-1">
                          {(dims.length || dims.width || dims.height) && (
                            <SpecRow icon={Maximize2} label={d("pages.vehicle.techSpecs.lxwxh")} value={[dims.length?.value, dims.width?.value, dims.height?.value].filter(Boolean).join(" x ") + (dims.length?.unit ? ` ${dims.length.unit}` : " mm")} />
                          )}
                          {dims.wheelbase && <SpecRow icon={ArrowLeftRight} label={d("pages.vehicle.techSpecs.wheelbase")} value={fmtField(dims.wheelbase)} />}
                          {(dims.weight_unladen_eu || dims.weight) && <SpecRow icon={Scale} label={d("pages.vehicle.techSpecs.weight")} value={fmtField(dims.weight_unladen_eu || dims.weight)} />}
                          {dims.cargo_volume && <SpecRow icon={Package} label={d("pages.vehicle.techSpecs.cargo")} value={fmtField(dims.cargo_volume)} />}
                          {dims.seats && <SpecRow icon={Users} label={d("pages.vehicle.techSpecs.seats")} value={fmtField(dims.seats)} />}
                          {dims.tow_hitch_possible != null && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5"><Truck className="h-4 w-4 shrink-0" />{d("pages.vehicle.techSpecs.towHitch")}</span>
                              <div className="flex items-center gap-2">
                                {dims.tow_hitch_possible && dims.towing_weight_braked && <span className="text-xs text-muted-foreground">{fmtField(dims.towing_weight_braked)}</span>}
                                <BooleanBadge supported={dims.tow_hitch_possible} tYes={d("pages.vehicle.common.yes")} tNo={d("pages.vehicle.common.no")} />
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* GetQuote CTA */}
          {hasGetQuoteBlock && (
            <GetQuote
              title={d("pages.vehicle.blocks.getquote.headline", { brand: vehicle.brand, model: vehicle.model })}
              subtitle={d("pages.vehicle.blocks.getquote.subheadline", { brand: vehicle.brand, model: vehicle.model })}
              ctaLabel={d("pages.vehicle.blocks.getquote.cta.label", { brand: vehicle.brand, model: vehicle.model })}
              ctaHref={quoteHref}
              note={d("pages.vehicle.blocks.getquote.note", { brand: vehicle.brand, model: vehicle.model })}
              variant={getQuoteVariant as "primary" | "muted"}
              image={getQuoteImage}
            />
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
        heroSubtitle={heroTranslation?.subheadline || t(dictionary, `${tPrefix}.blocks.hero.subheadline`, { count: brandsWithCounts.length })}
        heroImage={heroImage}
        getQuoteBlock={getQuoteData}
      />
    );
  }

  // Quote success
  if (route.type === "quote-success") {
    const [quotePage, layoutData, registry] = await Promise.all([
      fetchPage("quote-success", locale),
      fetchLayout(locale),
      fetchPageRegistry(),
    ]);
    const dictionary = quotePage
      ? extractPageDictionary("quote-success", quotePage, locale)
      : {};

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

    return (
      <Suspense>
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
        />
      </Suspense>
    );
  }

  // Quote submission view
  if (route.type === "quote-submission") {
    const [quotePage, quoteViewPage, layoutData] = await Promise.all([
      fetchPage("quote", locale),
      fetchPage("quote-view", locale),
      fetchLayout(locale),
    ]);
    const quoteDict = quotePage
      ? extractPageDictionary("quote", quotePage, locale)
      : {};
    const viewDict = quoteViewPage
      ? extractPageDictionary("quote-view", quoteViewPage, locale)
      : {};
    const dictionary = { ...quoteDict, ...viewDict };

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

  notFound();
}
