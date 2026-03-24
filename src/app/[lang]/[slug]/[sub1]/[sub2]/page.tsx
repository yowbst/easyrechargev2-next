import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { isValidLang, slugToDirectusLocale, getDateLocale } from "@/lib/i18n/config";
import { getRouteSlug } from "@/lib/i18n/config";
import { extractLayoutDictionary, extractPageDictionary, t } from "@/lib/i18n/dictionaries";
import { resolveSub2Route } from "@/lib/route-resolver";
import {
  fetchBlogPost,
  fetchBlogPosts,
  fetchVehicle,
  fetchVehicles,
  fetchVehicleBrands,
  fetchPageRegistry,
  fetchLayout,
  fetchPage,
} from "@/lib/directus-queries";
import { VehicleBrandDetail } from "@/components/VehicleBrandDetail";
import { transformDirectusVehicle, formatMinutes } from "@/lib/vehicleTransformer";
import type { Vehicle } from "@/lib/vehicleTransformer";
import { DIRECTUS_URL } from "@/lib/directus";
import { cmsImage } from "@/lib/directusAssets";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  extractItemSEO,
  mergeItemOverTemplate,
  resolveSEOFieldMappings,
  resolveOgImage,
  resolveImageUrl,
  buildAlternates,
  getSiteUrl,
  decodeHtmlEntities,
} from "@/lib/seo/resolver";
import {
  wrapInGraph,
  buildBlogPosting,
  buildBreadcrumbList,
  buildVehicleProduct,
} from "@/lib/seo/jsonLd";
import { resolveRouteLinks } from "@/lib/pageConfig";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { VehicleDetailClient } from "@/components/VehicleDetailClient";
import { GetQuote } from "@/components/GetQuote";
import { LucideCmsIcon } from "@/components/LucideCmsIcon";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Battery,
  Car,
  Zap,
  Plug,
  Gauge,
  BadgeDollarSign,
  BatteryCharging,
  Check,
  X,
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

// --- Vehicle detail inline helper components ---

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

interface Sub2PageProps {
  params: Promise<{ lang: string; slug: string; sub1: string; sub2: string }>;
}

export const dynamicParams = true;

function parseReadingTime(v: unknown): number {
  if (!v) return 5;
  if (typeof v === "number") return v;
  const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
  if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  return parseInt(String(v), 10) || 5;
}

export async function generateStaticParams() {
  const LANG_MAP: Record<string, "fr" | "de"> = { "fr-FR": "fr", "de-DE": "de" };
  const registry = await fetchPageRegistry();
  const blogPage = registry.find((p) => p.id === "blog");

  const params: { lang: string; slug: string; sub1: string; sub2: string }[] = [];

  for (const locale of ["fr-FR", "de-DE"] as const) {
    const lang = LANG_MAP[locale];
    const blogSlug = blogPage?.slugs[lang] || "blog";
    const posts = await fetchBlogPosts(locale);

    for (const post of posts) {
      const pt = post.translations?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.languages_code === locale,
      );
      const ct = post.category?.translations?.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.languages_code === locale,
      );
      if (pt?.slug && ct?.slug) {
        params.push({ lang, slug: blogSlug, sub1: ct.slug, sub2: pt.slug });
      }
    }
  }

  return params;
}

export async function generateMetadata({ params }: Sub2PageProps): Promise<Metadata> {
  const { lang, slug, sub1, sub2 } = await params;
  if (!isValidLang(lang)) return {};

  const route = await resolveSub2Route(slug, sub1, sub2, lang);
  if (!route) return {};

  if (route.type === "blog-post") {
    const locale = slugToDirectusLocale(lang);
    const [post, templatePage] = await Promise.all([
      fetchBlogPost(route.postSlug, locale),
      fetchPage("blog-post", locale),
    ]);
    if (!post) return {};

    const pt = post.translations?.[0];
    const ct = post.category?.translations?.[0];
    const articleTitle = pt?.title || route.postSlug;

    const imageUrl = post.image ? resolveImageUrl(post.image) : undefined;
    const categoryName = ct?.name || route.categorySlug;

    // Parse reading_time and build takeaways text for SEO interpolation
    const readingTime = parseReadingTime(post.reading_time);
    const takeaways = pt?.takeaways
      ? decodeHtmlEntities(String(pt.takeaways).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim())
      : undefined;

    const templateSeo = extractItemSEO(templatePage?.translations?.[0]?.seo);
    const itemSeo = extractItemSEO(pt?.seo);
    const merged = mergeItemOverTemplate(itemSeo, templateSeo);
    const resolved = resolveSEOFieldMappings(merged, {
      title: articleTitle,
      excerpt: pt?.excerpt || "",
      category: categoryName,
      slug: route.postSlug,
      readingTime: readingTime || undefined,
      image: imageUrl,
      takeaways,
    });

    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;

    const langPaths: Record<string, string> = {};
    const registry = await fetchPageRegistry();
    const blogPage = registry.find((p) => p.id === "blog");

    for (const l of ["fr", "de"] as const) {
      const loc = slugToDirectusLocale(l);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const postTrans = post.translations?.find((t: any) => t.languages_code === loc);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const catTrans = post.category?.translations?.find((t: any) => t.languages_code === loc);
      if (postTrans?.slug && catTrans?.slug) {
        const blogPageSlug = blogPage?.slugs[l] || "blog";
        langPaths[l] = `/${l}/${blogPageSlug}/${catTrans.slug}/${postTrans.slug}`;
      }
    }

    // OG image with hero fallback from template page
    const heroImage = templatePage?.blocks?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.collection === "block_hero",
    )?.item?.image;

    return buildMetadata({
      title: normalizeTitle(resolved?.title || articleTitle),
      description: truncate(resolved?.description || articleTitle),
      canonical: `${SITE_URL}${currentPath}`,
      ogImage: resolveOgImage(resolved, imageUrl, heroImage),
      ogType: "article",
      robots: resolved?.noIndex ? "noindex, nofollow" : undefined,
      lang,
      alternates: buildAlternates(langPaths),
      articleMeta: {
        publishedTime: post.date_published || post.date_created,
        modifiedTime: post.date_updated,
        section: categoryName,
      },
    });
  }

  if (route.type === "vehicle-brand-detail") {
    const locale = slugToDirectusLocale(lang);
    const [rawVehicles, rawBrands, brandPage] = await Promise.all([
      fetchVehicles(locale),
      fetchVehicleBrands(locale),
      fetchPage("vehicle-brand", locale),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedBrand = (rawBrands || []).find((b: any) => b.slug === route.brandSlug);
    const brandName = matchedBrand?.name || route.brandSlug;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vehicleCount = (rawVehicles || []).filter((v: any) => v.brand?.slug === route.brandSlug).length;

    const templateSeo = extractItemSEO(brandPage?.translations?.[0]?.seo);
    // Source: brands don't have accessible item-level SEO — only template
    const merged = mergeItemOverTemplate(undefined, templateSeo);
    const resolved = resolveSEOFieldMappings(merged, {
      name: brandName,
      count: vehicleCount,
      slug: route.brandSlug,
    });

    // Language-specific fallbacks matching source
    const fallbackTitle = lang === "de"
      ? `${brandName} \u2013 Elektrofahrzeuge`
      : `${brandName} \u2013 V\u00e9hicules \u00e9lectriques`;
    const fallbackDesc = lang === "de"
      ? `Entdecken Sie die ${vehicleCount} Elektrofahrzeuge von ${brandName}, kompatibel mit unseren Ladestationen.`
      : `D\u00e9couvrez les ${vehicleCount} v\u00e9hicules \u00e9lectriques ${brandName} compatibles avec nos bornes de recharge.`;

    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");
    const brandsSlugOther = getRouteSlug(otherLang, "brands");

    const brandImage = matchedBrand?.thumbnail ? resolveImageUrl(matchedBrand.thumbnail) : undefined;
    const heroImage = brandPage?.blocks?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any) => b.collection === "block_hero",
    )?.item?.image;

    return buildMetadata({
      title: normalizeTitle(resolved?.title || fallbackTitle),
      description: truncate(resolved?.description || fallbackDesc),
      canonical: `${SITE_URL}${currentPath}`,
      ogImage: resolveOgImage(resolved, brandImage, heroImage),
      ogType: "website",
      robots: resolved?.noIndex ? "noindex, nofollow" : undefined,
      lang,
      alternates: buildAlternates({
        [lang]: currentPath,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${brandsSlugOther}/${route.brandSlug}`,
      }),
    });
  }

  if (route.type === "vehicle-model-detail") {
    const locale = slugToDirectusLocale(lang);
    const [directusVehicle, templatePage] = await Promise.all([
      fetchVehicle(route.vehicleSlug, locale),
      fetchPage("vehicle", locale),
    ]);
    if (!directusVehicle) return {};

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) return {};

    const dv = directusVehicle;
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
      slug: route.vehicleSlug,
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

    // Merge template SEO with field interpolation (vehicles have no item-level SEO)
    const templateSeo = extractItemSEO(templatePage?.translations?.[0]?.seo);
    const merged = mergeItemOverTemplate(undefined, templateSeo);
    const resolved = resolveSEOFieldMappings(merged, fieldMap);

    const title = resolved?.title || vehicleName;
    const description = resolved?.description || [vehicleName, vehicle.batteryDisplay, vehicle.rangeDisplay, vehicle.chargingDisplay].filter(Boolean).join(" | ");

    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const otherLang = lang === "de" ? "fr" : "de";
    const vehiclesSlugOther = getRouteSlug(otherLang, "vehicles");
    const brandSlugOther = route.brandSlug; // brand slug is lang-independent

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
        [lang]: currentPath,
        [otherLang]: `/${otherLang}/${vehiclesSlugOther}/${brandSlugOther}/${route.vehicleSlug}`,
      }),
    });
  }

  return {};
}

export default async function Sub2Page({ params }: Sub2PageProps) {
  const { lang, slug, sub1, sub2 } = await params;
  if (!isValidLang(lang)) notFound();

  const route = await resolveSub2Route(slug, sub1, sub2, lang);
  if (!route) notFound();

  const locale = slugToDirectusLocale(lang);

  // ── Blog post ──────────────────────────────────────────────────────
  if (route.type === "blog-post") {
    const [post, templatePage, layoutData, registry] = await Promise.all([
      fetchBlogPost(route.postSlug, locale),
      fetchPage("blog-post", locale),
      fetchLayout(locale),
      fetchPageRegistry(),
    ]);
    if (!post) notFound();

    // Dictionary: layout shared + blog-post page template
    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const pageDict = templatePage ? extractPageDictionary("blog-post", templatePage, locale) : {};
    const dictionary = { ...layoutDict, ...pageDict };

    // Pre-interpolate global config SLA values into dictionary strings
    const gc = layoutData?.global_config || {};
    const slas = gc?.slas || {};
    const slaVars: Record<string, string> = {
      quote_request_duration: String(slas?.quote_request_duration?.value ?? 3),
      first_contact: String(slas?.first_contact?.value ?? 48),
      quote_delivery_timeline: String(slas?.quote_delivery_timeline?.value ?? "3-5"),
    };
    for (const key of Object.keys(dictionary)) {
      for (const [varName, varVal] of Object.entries(slaVars)) {
        if (dictionary[key].includes(`{${varName}}`)) {
          dictionary[key] = dictionary[key].replace(new RegExp(`\\{${varName}\\}`, "g"), varVal);
        }
      }
    }
    const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);
    /** Dictionary lookup with explicit fallback — returns fallback when key resolves to itself. */
    const df = (key: string, fallback: string, vars?: Record<string, string | number>) => {
      const val = t(dictionary, key, vars);
      return val === key ? fallback : val;
    };

    const pt = post.translations?.[0];
    const ct = post.category?.translations?.[0];
    if (!pt) notFound();

    const articleTitle = pt.title || "";
    const rawExcerpt = pt.excerpt || "";
    const articleExcerpt = decodeHtmlEntities(rawExcerpt);
    const articleBody = pt.body || "";
    const expertAdvice = pt.expert_advice || "";
    const takeaways = pt.takeaways || "";
    const categoryName = ct?.name || df("pages.blog-post.defaultCategory", "Guide");
    const readingTime = parseReadingTime(post.reading_time);

    const dateValue = post.date_published || post.date_created;
    const formattedDate = dateValue
      ? new Date(dateValue).toLocaleDateString(getDateLocale(lang), {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const imageUrl = post.image
      ? `${DIRECTUS_URL}/assets/${post.image}`
      : "https://images.unsplash.com/photo-1593941707882-a5bba14938c7?w=1200&h=600&fit=crop";

    // Page template config (for expert advice / takeaways icon names)
    const config = templatePage?.config || {};

    // GetQuote block from blog-post template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = templatePage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const hasGetQuoteBlock = !!getQuoteBlock?.translations?.[0];
    const getQuoteVariant = getQuoteBlock?.variant === "green" ? "primary" : "muted";
    const getQuoteImage = getQuoteBlock?.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined;

    // Resolve CTA href for GetQuote
    const quotePage = registry.find((p) => p.id === "quote");
    const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

    // JSON-LD
    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const absoluteImage = imageUrl.startsWith("http") ? imageUrl : `${SITE_URL}${imageUrl}`;
    const langCode = lang === "de" ? "de-CH" : lang === "en" ? "en" : "fr-CH";

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: d("common.home"), url: `${SITE_URL}/${lang}` },
        { name: "Blog", url: `${SITE_URL}/${lang}/${slug}` },
        { name: categoryName, url: `${SITE_URL}/${lang}/${slug}/${sub1}` },
        { name: articleTitle, url: `${SITE_URL}${currentPath}` },
      ]),
      buildBlogPosting({
        headline: articleTitle,
        description: articleExcerpt || articleTitle,
        imageUrl: absoluteImage,
        datePublished: post.date_published || post.date_created || "",
        dateModified: post.date_updated,
        categoryName,
        url: `${SITE_URL}${currentPath}`,
        langCode,
      }),
    );

    // Resolve internal route links in body HTML
    const safeBody = resolveRouteLinks(articleBody, lang, registry);

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Back navigation */}
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container mx-auto px-4 py-3">
            <Link
              href={`/${lang}/${slug}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {df("pages.blog-post.subheader.back", lang === "de" ? "Zurück zum Blog" : "Retour au blog")}
            </Link>
          </div>
        </nav>

        <div className="flex-1">
          {/* Hero image with overlay text */}
          <section className="relative h-80 sm:h-96 md:h-[28rem] lg:h-[32rem] overflow-hidden">
            <img
              {...cmsImage(imageUrl, [640, 1024, 1200], { quality: 80 })}
              alt={articleTitle}
              fetchPriority="high"
              width={1200}
              height={600}
              className="absolute inset-0 w-full h-full object-cover"
              data-testid="img-article-hero"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 text-white">
              <div className="container mx-auto px-4 pb-8 md:pb-12">
                <div className="max-w-3xl">
                  <Badge
                    className="mb-3 bg-white/15 text-white hover:bg-white/25 border-white/20 backdrop-blur-sm text-xs font-medium tracking-wide uppercase"
                    data-testid="badge-article-category"
                  >
                    {categoryName}
                  </Badge>
                  <h1
                    className="text-2xl sm:text-3xl md:text-4xl lg:text-[2.75rem] font-heading font-bold leading-[1.15] tracking-tight"
                    data-testid="text-article-title"
                  >
                    {articleTitle}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm text-white/80">
                    {formattedDate && (
                      <div
                        className="flex items-center gap-1.5"
                        data-testid="text-article-date"
                      >
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{formattedDate}</span>
                      </div>
                    )}
                    {formattedDate && (
                      <span className="text-white/40" aria-hidden="true">|</span>
                    )}
                    <div
                      className="flex items-center gap-1.5"
                      data-testid="text-article-reading-time"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {df("pages.blog-post.readingTime.label",
                          df("shared.blogCard.readingTime.label_one",
                            `${readingTime} min`,
                            { count: readingTime }),
                          { count: readingTime })}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Article content + sidebar */}
          <section className="py-10 md:py-16">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12">
                  {/* Main article column */}
                  <article className="lg:col-span-7 min-w-0">
                    {/* Lede / excerpt */}
                    {articleExcerpt && (
                      <p
                        className="text-lg md:text-xl text-muted-foreground leading-relaxed mb-8 pb-8 border-b border-border/60"
                        data-testid="text-article-excerpt"
                      >
                        {articleExcerpt}
                      </p>
                    )}

                    {/* Article body */}
                    <div
                      className={[
                        "prose dark:prose-invert max-w-prose",
                        "prose-p:leading-[1.8] prose-p:text-base prose-p:text-foreground/85",
                        "prose-headings:font-heading prose-headings:tracking-tight prose-headings:text-foreground",
                        "prose-h2:text-2xl prose-h2:mt-12 prose-h2:mb-4",
                        "prose-h3:text-xl prose-h3:mt-10 prose-h3:mb-3",
                        "prose-h4:text-lg prose-h4:mt-8 prose-h4:mb-2",
                        "prose-li:text-base prose-li:leading-[1.8] prose-li:text-foreground/85",
                        "prose-ul:my-6 prose-ol:my-6",
                        "prose-a:text-primary prose-a:font-medium prose-a:no-underline hover:prose-a:underline",
                        "prose-img:rounded-lg prose-img:my-8",
                        "prose-blockquote:border-l-primary/40 prose-blockquote:text-foreground/75 prose-blockquote:not-italic prose-blockquote:font-normal",
                        "prose-hr:border-border/60 prose-hr:my-10",
                        "prose-strong:text-foreground prose-strong:font-semibold",
                      ].join(" ")}
                      data-testid="article-body"
                    >
                      {safeBody ? (
                        <div dangerouslySetInnerHTML={{ __html: safeBody }} />
                      ) : (
                        <p className="text-muted-foreground">
                          {df("pages.blog-post.noContent", lang === "de" ? "Kein Inhalt verfügbar." : "Aucun contenu disponible.")}
                        </p>
                      )}
                    </div>

                    {/* Tags */}
                    {post.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t">
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {post.tags.map((tagJunction: any) => {
                          const tag = tagJunction?.blog_tags_id;
                          const tagName = tag?.translations?.[0]?.name || tag?.name;
                          if (!tagName) return null;
                          return (
                            <span
                              key={tag.id}
                              className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground"
                            >
                              {tagName}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </article>

                  {/* Sidebar */}
                  <aside className="lg:col-span-5">
                    <div className="lg:sticky lg:top-24 space-y-5">
                      <MiniQuoteCard
                        pageId="blog-post"
                        dictionary={dictionary}
                        pageRegistry={registry}
                        lang={lang}
                      />

                      {expertAdvice && (
                        <Card
                          className="p-5 bg-muted/50 dark:bg-muted/30 border-border/50"
                          data-testid="card-expert-advice"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <LucideCmsIcon
                                name={config.expertAdvice?.icon}
                                className="h-4 w-4 text-primary"
                              />
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {df("pages.blog-post.expertAdvice.title", lang === "de" ? "Expertenrat" : "Conseil d'expert")}
                              </span>
                            </div>
                            <blockquote className="text-sm leading-relaxed text-foreground/80 italic border-l-2 border-primary/30 pl-3">
                              <div
                                dangerouslySetInnerHTML={{ __html: expertAdvice }}
                              />
                            </blockquote>
                          </div>
                        </Card>
                      )}

                      {takeaways && (
                        <Card
                          className="p-5 bg-muted/50 dark:bg-muted/30 border-border/50"
                          data-testid="card-article-takeaways"
                        >
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <LucideCmsIcon
                                name={config.takeaways?.icon}
                                className="h-4 w-4 text-primary"
                              />
                              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {df("pages.blog-post.takeaways.title", lang === "de" ? "Wichtige Erkenntnisse" : "Points clés")}
                              </span>
                            </div>
                            <div
                              className="prose prose-sm dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-relaxed prose-li:text-sm prose-li:leading-relaxed prose-ul:my-2 prose-ol:my-2 prose-p:text-foreground/80 prose-li:text-foreground/80"
                              data-testid="article-takeaways-content"
                            >
                              <div
                                dangerouslySetInnerHTML={{ __html: takeaways }}
                              />
                            </div>
                          </div>
                        </Card>
                      )}
                    </div>
                  </aside>
                </div>
              </div>
            </div>
          </section>

          {/* GetQuote CTA */}
          {hasGetQuoteBlock && (
            <GetQuote
              title={d("pages.blog-post.blocks.getquote.headline")}
              subtitle={d("pages.blog-post.blocks.getquote.subheadline")}
              ctaLabel={d("pages.blog-post.blocks.getquote.cta.label")}
              ctaHref={quoteHref}
              note={d("pages.blog-post.blocks.getquote.note")}
              variant={getQuoteVariant as "primary" | "muted"}
              image={getQuoteImage}
            />
          )}
        </div>
      </>
    );
  }

  // ── Vehicle model detail ─────────────────────────────────────────
  if (route.type === "vehicle-model-detail") {
    const [directusVehicle, layoutData, vehiclePage, registry] = await Promise.all([
      fetchVehicle(route.vehicleSlug, locale),
      fetchLayout(locale),
      fetchPage("vehicle", locale),
      fetchPageRegistry(),
    ]);
    if (!directusVehicle) notFound();

    const vehicle = transformDirectusVehicle(directusVehicle);
    if (!vehicle) notFound();

    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const pageDict = vehiclePage ? extractPageDictionary("vehicle", vehiclePage, locale) : {};
    const dictionary = { ...layoutDict, ...pageDict };
    const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);
    const df = (key: string, fallback: string, vars?: Record<string, string | number>) => {
      const val = t(dictionary, key, vars);
      return val === key ? fallback : val;
    };

    // Pre-interpolate SLA vars
    const gc = layoutData?.global_config || {};
    const slas = gc?.slas || {};
    const slaVars: Record<string, string> = {
      quote_request_duration: String(slas?.quote_request_duration?.value ?? 3),
      first_contact: String(slas?.first_contact?.value ?? 48),
    };
    for (const key of Object.keys(dictionary)) {
      for (const [varName, varVal] of Object.entries(slaVars)) {
        if (dictionary[key].includes(`{${varName}}`)) {
          dictionary[key] = dictionary[key].replace(new RegExp(`\\{${varName}\\}`, "g"), varVal);
        }
      }
    }

    // --- Extract rich vehicle data ---
    const description = directusVehicle.description || "";
    const homeCharging = vehicle.charging?.home_destination;
    const homeChargingDetailsRaw: Record<string, unknown>[] =
      directusVehicle.home_destination_charging_details?.type2_plug || [];
    const homeChargingDetails = homeChargingDetailsRaw.map((row: Record<string, unknown>) => {
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

    const fastChargingData = directusVehicle.charging?.fast_charging;
    const plugCharge = directusVehicle.charging?.plug_charge;
    const batteryPreconditioning = directusVehicle.charging?.battery_preconditioning;
    const realRange = directusVehicle.real_range;
    const batteryDetails = directusVehicle.battery_details;
    const perf = directusVehicle.performance;
    const dims = directusVehicle.dimensions_weight;
    const v2x = directusVehicle.v2x_charging;

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

    const brandName = directusVehicle.brand?.name || "";
    const vehicleName = `${vehicle.brand} ${vehicle.model}`.trim();

    // Helpers
    const fmtField = (field: any): string => {
      if (field == null) return "-";
      if (typeof field !== "object") return String(field);
      if (field.value != null) return `${field.value} ${field.unit || ""}`.trim();
      if (field.type != null) return String(field.type);
      if (field.name != null) return String(field.name);
      return "-";
    };
    const safeStr = (val: any): string => {
      if (val == null) return "-";
      if (typeof val === "string") return val;
      if (typeof val === "number") return String(val);
      return fmtField(val);
    };

    // JSON-LD
    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const absoluteImage = directusVehicle.thumbnail
      ? (resolveImageUrl(directusVehicle.thumbnail) || `${SITE_URL}/og-default.webp`)
      : `${SITE_URL}/og-default.webp`;

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: d("common.home"), url: `${SITE_URL}/${lang}` },
        { name: df("pages.vehicle.breadcrumb.vehicles", lang === "de" ? "Fahrzeuge" : "Vehicules"), url: `${SITE_URL}/${lang}/${slug}` },
        { name: brandName, url: `${SITE_URL}/${lang}/${slug}/${getRouteSlug(lang, "brands")}/${route.brandSlug}` },
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
    const getQuoteBlock = vehiclePage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const hasGetQuoteBlock = !!getQuoteBlock?.translations?.[0];
    const getQuoteVariant = getQuoteBlock?.variant === "green" ? "primary" : "muted";
    const getQuoteImage = getQuoteBlock?.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined;
    const quotePage = registry.find((p) => p.id === "quote");
    const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* Back Button */}
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="container mx-auto px-4 py-3">
            <Link
              href={`/${lang}/${slug}/${getRouteSlug(lang, "brands")}/${route.brandSlug}`}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {df("pages.vehicle.subheader.back", `${brandName}`, { brand: brandName })}
            </Link>
          </div>
        </nav>

        <div className="flex-1">
          {/* SECTION 1: Hero + Key Specs + Sidebar */}
          <section className="py-12">
            <div className="container mx-auto px-4">
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  {/* Main content */}
                  <div className="lg:col-span-8">
                    {/* Image */}
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

                    {/* Brand + Title */}
                    <div className="flex items-center gap-3 mb-2">
                      <Badge variant="secondary">{vehicle.brand}</Badge>
                    </div>
                    <h1 className="text-4xl font-heading font-bold mb-4">{vehicle.model}</h1>

                    {/* Description */}
                    {description && (
                      <p className="text-lg text-muted-foreground mb-8">{description}</p>
                    )}

                    {/* 6 Stat Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Battery className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.battery")}
                          </span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.batteryDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Car className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.range")}
                          </span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.rangeDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Zap className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.dcCharge")}
                          </span>
                        </div>
                        <div className="text-2xl font-bold">
                          {dcMaxPower ? fmtField(dcMaxPower) : vehicle.chargingDisplay}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Plug className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.acPower")}
                          </span>
                        </div>
                        <div className="text-2xl font-bold">
                          {acPower ? fmtField(acPower) : "-"}
                        </div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Gauge className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.efficiency")}
                          </span>
                        </div>
                        <div className="text-2xl font-bold">{vehicle.efficiencyDisplay}</div>
                      </Card>
                      <Card className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <BadgeDollarSign className="h-5 w-5 text-primary" />
                          <span className="text-sm text-muted-foreground">
                            {d("pages.vehicle.specs.pricePerRange")}
                          </span>
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
                <h2 className="text-3xl font-heading font-bold mb-8">
                  {d("pages.vehicle.sections.homeCharging")}
                </h2>

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
                              <TableCell>
                                {homeCharging?.charge_time?.value ? formatMinutes(homeCharging.charge_time.value) : "-"}
                              </TableCell>
                              <TableCell className="text-right">
                                {homeCharging?.charge_speed ? fmtField(homeCharging.charge_speed) : "-"}
                              </TableCell>
                            </TableRow>
                          );
                          const rows: React.ReactNode[] = [];
                          homeChargingDetails.forEach((row, i) => {
                            const cp = String(row.charging_point || "");
                            const isSubcategory = cp.startsWith("standard-") || cp.startsWith("optional-");

                            if (hasOptional && i === optionalIndex) {
                              rows.push(summaryRow);
                              rows.push(
                                <TableRow key="spacer" className="hover:bg-transparent">
                                  <TableCell colSpan={4} className="p-0 h-4" />
                                </TableRow>,
                              );
                            }

                            if (isSubcategory) {
                              rows.push(
                                <TableRow key={i} className="bg-muted/40">
                                  <TableCell colSpan={4} className="font-semibold text-sm py-2">
                                    {d(`pages.vehicle.homeCharging.table.chargingPoint.values.${cp}`)}
                                  </TableCell>
                                </TableRow>,
                              );
                              return;
                            }

                            const isLimited = row.is_limited || row.limited;
                            rows.push(
                              <TableRow key={i}>
                                <TableCell className="font-medium">
                                  {d(`pages.vehicle.homeCharging.table.chargingPoint.values.${cp}`)}
                                </TableCell>
                                <TableCell>
                                  {row.charge_power ? fmtField(row.charge_power) : "-"}
                                  {isLimited && (
                                    <span className="text-muted-foreground ml-1" title={d("pages.vehicle.homeCharging.table.limitedTooltip")}>
                                      *
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.charge_time?.value ? formatMinutes(row.charge_time.value) : "-"}
                                </TableCell>
                                <TableCell className="text-right">
                                  {row.charge_speed?.value
                                    ? `${row.charge_speed.value} ${row.charge_speed.unit || "km/h"}`
                                    : "-"}
                                </TableCell>
                              </TableRow>,
                            );
                          });
                          if (!hasOptional) rows.push(summaryRow);
                          return rows;
                        })()}
                      </TableBody>
                    </Table>
                    {homeChargingDetails.some((r) => r.is_limited || r.limited) && (
                      <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                        * {d("pages.vehicle.homeCharging.table.limitedNote")}
                      </div>
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
                    {/* DC Fast Charging */}
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
                            value={
                              dcTime?.value
                                ? `${dcTime.value} ${dcTime.unit || "min"}${
                                    dcTime.range
                                      ? ` (${dcTime.range.from?.value || "?"}${dcTime.range.from?.unit || ""} → ${dcTime.range.to?.value || "?"}${dcTime.range.to?.unit || ""})`
                                      : ""
                                  }`
                                : "-"
                            }
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
                                  <span className="text-xs text-muted-foreground">
                                    {d("pages.vehicle.fastCharging.preconditioningAutoUsingNav")}
                                  </span>
                                )}
                                <BooleanBadge
                                  supported={batteryPreconditioning.precond_possible}
                                  tYes={d("pages.vehicle.common.yes")}
                                  tNo={d("pages.vehicle.common.no")}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Smart Charging Features */}
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
                                {plugCharge.supported_protocol && (
                                  <span className="text-xs text-muted-foreground">{safeStr(plugCharge.supported_protocol)}</span>
                                )}
                                <BooleanBadge
                                  supported={plugCharge.plug_charge_supported}
                                  tYes={d("pages.vehicle.common.yes")}
                                  tNo={d("pages.vehicle.common.no")}
                                />
                              </div>
                            </div>
                          )}
                          {autocharge != null && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Wifi className="h-4 w-4 shrink-0" />
                                {d("pages.vehicle.smartCharging.autocharge")}
                              </span>
                              <BooleanBadge
                                supported={autocharge}
                                tYes={d("pages.vehicle.common.yes")}
                                tNo={d("pages.vehicle.common.no")}
                              />
                            </div>
                          )}
                          {v2x && (
                            <>
                              <div className="py-3"><Separator /></div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                  <PlugZap className="h-4 w-4 shrink-0" />
                                  {d("pages.vehicle.smartCharging.v2l")}
                                </span>
                                <div className="flex items-center gap-2">
                                  {v2x.vehicle_to_load?.supported && v2x.vehicle_to_load?.max_output_power && (
                                    <span className="text-xs text-muted-foreground">
                                      {v2x.vehicle_to_load.max_output_power.value} {v2x.vehicle_to_load.max_output_power.unit}
                                    </span>
                                  )}
                                  <BooleanBadge
                                    supported={v2x.vehicle_to_load?.supported}
                                    tYes={d("pages.vehicle.common.yes")}
                                    tNo={d("pages.vehicle.common.no")}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                  <Home className="h-4 w-4 shrink-0" />
                                  {d("pages.vehicle.smartCharging.v2h")}
                                </span>
                                <div className="flex items-center gap-2">
                                  {(v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported) &&
                                    (v2x.vehicle_to_home?.ac_max_output_power || v2x.vehicle_to_home?.dc_max_output_power) && (
                                    <span className="text-xs text-muted-foreground">
                                      {fmtField(v2x.vehicle_to_home.ac_max_output_power || v2x.vehicle_to_home.dc_max_output_power)}
                                    </span>
                                  )}
                                  <BooleanBadge
                                    supported={v2x.vehicle_to_home?.ac_supported || v2x.vehicle_to_home?.dc_supported}
                                    tYes={d("pages.vehicle.common.yes")}
                                    tNo={d("pages.vehicle.common.no")}
                                  />
                                </div>
                              </div>
                              <div className="flex justify-between items-center py-1.5">
                                <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                  <Network className="h-4 w-4 shrink-0" />
                                  {d("pages.vehicle.smartCharging.v2g")}
                                </span>
                                <div className="flex items-center gap-2">
                                  {(v2x.vehicle_to_grid?.ac_supported || v2x.vehicle_to_grid?.dc_supported) &&
                                    (v2x.vehicle_to_grid?.ac_max_output_power || v2x.vehicle_to_grid?.dc_max_output_power) && (
                                    <span className="text-xs text-muted-foreground">
                                      {fmtField(v2x.vehicle_to_grid.ac_max_output_power || v2x.vehicle_to_grid.dc_max_output_power)}
                                    </span>
                                  )}
                                  <BooleanBadge
                                    supported={v2x.vehicle_to_grid?.ac_supported || v2x.vehicle_to_grid?.dc_supported}
                                    tYes={d("pages.vehicle.common.yes")}
                                    tNo={d("pages.vehicle.common.no")}
                                  />
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

          {/* SECTION 4: Real World Range — Client component for tabs */}
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
                  <h2 className="text-3xl font-heading font-bold mb-8">
                    {d("pages.vehicle.sections.techSpecs")}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Battery Details */}
                    {batteryDetails && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Battery className="h-5 w-5 text-primary" />
                          {d("pages.vehicle.techSpecs.battery")}
                        </h3>
                        <div className="space-y-1">
                          {batteryDetails.nominal_capacity && (
                            <SpecRow icon={BatteryFull} label={d("pages.vehicle.techSpecs.nominalCapacity")} value={fmtField(batteryDetails.nominal_capacity)} />
                          )}
                          {batteryDetails.useable_capacity && (
                            <SpecRow icon={BatteryMedium} label={d("pages.vehicle.techSpecs.useableCapacity")} value={fmtField(batteryDetails.useable_capacity)} />
                          )}
                          {(batteryDetails.type || batteryDetails.battery_type) && (
                            <SpecRow icon={FlaskConical} label={d("pages.vehicle.techSpecs.type")} value={safeStr(batteryDetails.type || batteryDetails.battery_type)} />
                          )}
                          {batteryDetails.architecture && (
                            <SpecRow icon={Layers} label={d("pages.vehicle.techSpecs.architecture")} value={fmtField(batteryDetails.architecture)} />
                          )}
                          {(batteryDetails.warranty_period || batteryDetails.warranty_mileage) && (
                            <SpecRow
                              icon={ShieldCheck}
                              label={d("pages.vehicle.techSpecs.warranty")}
                              value={[
                                batteryDetails.warranty_period ? fmtField(batteryDetails.warranty_period) : null,
                                batteryDetails.warranty_mileage ? fmtField(batteryDetails.warranty_mileage) : null,
                              ].filter(Boolean).join(" / ")}
                            />
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Performance */}
                    {perf && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Rocket className="h-5 w-5 text-primary" />
                          {d("pages.vehicle.techSpecs.performance")}
                        </h3>
                        <div className="space-y-1">
                          {perf.acceleration_0_100 && (
                            <SpecRow icon={Timer} label={d("pages.vehicle.techSpecs.acceleration")} value={fmtField(perf.acceleration_0_100)} />
                          )}
                          {perf.top_speed && (
                            <SpecRow icon={Gauge} label={d("pages.vehicle.techSpecs.topSpeed")} value={fmtField(perf.top_speed)} />
                          )}
                          {perf.power?.ps && (
                            <SpecRow icon={Zap} label={d("pages.vehicle.techSpecs.powerPs")} value={fmtField(perf.power.ps)} />
                          )}
                          {perf.torque && (
                            <SpecRow icon={RotateCcw} label={d("pages.vehicle.techSpecs.torque")} value={fmtField(perf.torque)} />
                          )}
                          {perf.drive_type && (
                            <SpecRow icon={Car} label={d("pages.vehicle.techSpecs.driveType")} value={safeStr(perf.drive_type)} />
                          )}
                        </div>
                      </Card>
                    )}

                    {/* Dimensions */}
                    {dims && (
                      <Card className="p-6">
                        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                          <Ruler className="h-5 w-5 text-primary" />
                          {d("pages.vehicle.techSpecs.dimensions")}
                        </h3>
                        <div className="space-y-1">
                          {(dims.length || dims.width || dims.height) && (
                            <SpecRow
                              icon={Maximize2}
                              label={d("pages.vehicle.techSpecs.lxwxh")}
                              value={
                                [dims.length?.value, dims.width?.value, dims.height?.value]
                                  .filter(Boolean)
                                  .join(" x ") +
                                (dims.length?.unit ? ` ${dims.length.unit}` : " mm")
                              }
                            />
                          )}
                          {dims.wheelbase && (
                            <SpecRow icon={ArrowLeftRight} label={d("pages.vehicle.techSpecs.wheelbase")} value={fmtField(dims.wheelbase)} />
                          )}
                          {(dims.weight_unladen_eu || dims.weight) && (
                            <SpecRow icon={Scale} label={d("pages.vehicle.techSpecs.weight")} value={fmtField(dims.weight_unladen_eu || dims.weight)} />
                          )}
                          {dims.cargo_volume && (
                            <SpecRow icon={Package} label={d("pages.vehicle.techSpecs.cargo")} value={fmtField(dims.cargo_volume)} />
                          )}
                          {dims.seats && (
                            <SpecRow icon={Users} label={d("pages.vehicle.techSpecs.seats")} value={fmtField(dims.seats)} />
                          )}
                          {dims.tow_hitch_possible != null && (
                            <div className="flex justify-between items-center py-1.5">
                              <span className="text-muted-foreground text-sm flex items-center gap-1.5">
                                <Truck className="h-4 w-4 shrink-0" />
                                {d("pages.vehicle.techSpecs.towHitch")}
                              </span>
                              <div className="flex items-center gap-2">
                                {dims.tow_hitch_possible && dims.towing_weight_braked && (
                                  <span className="text-xs text-muted-foreground">{fmtField(dims.towing_weight_braked)}</span>
                                )}
                                <BooleanBadge
                                  supported={dims.tow_hitch_possible}
                                  tYes={d("pages.vehicle.common.yes")}
                                  tNo={d("pages.vehicle.common.no")}
                                />
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

  // ── Vehicle brand detail ───────────────────────────────────────────
  if (route.type === "vehicle-brand-detail") {
    const [rawVehicles, rawBrands, layoutData, vehicleBrandPage, vehicleTemplatePage, registry] = await Promise.all([
      fetchVehicles(locale),
      fetchVehicleBrands(locale),
      fetchLayout(locale),
      fetchPage("vehicle-brand", locale),
      fetchPage("vehicle", locale),
      fetchPageRegistry(),
    ]);

    const brandsSegment = getRouteSlug(lang, "brands");

    // Build dictionary: layout + vehicle-brand page + vehicle template (for VehicleCard labels)
    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const brandPageDict = vehicleBrandPage ? extractPageDictionary("vehicle-brand", vehicleBrandPage, locale) : {};
    const vehicleTemplateDict = vehicleTemplatePage ? extractPageDictionary("vehicle", vehicleTemplatePage, locale) : {};
    const dictionary = { ...layoutDict, ...brandPageDict, ...vehicleTemplateDict };

    // Pre-interpolate SLA vars
    const gc = layoutData?.global_config || {};
    const slas = gc?.slas || {};
    const slaVars: Record<string, string> = {
      quote_request_duration: String(slas?.quote_request_duration?.value ?? 3),
      first_contact: String(slas?.first_contact?.value ?? 48),
    };
    for (const key of Object.keys(dictionary)) {
      for (const [varName, varVal] of Object.entries(slaVars)) {
        if (dictionary[key].includes(`{${varName}}`)) {
          dictionary[key] = dictionary[key].replace(new RegExp(`\\{${varName}\\}`, "g"), varVal);
        }
      }
    }

    // Find matching brand
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedBrand = (rawBrands || []).find((b: any) => b.slug === route.brandSlug);
    const brandName = matchedBrand?.name || route.brandSlug;

    // Filter vehicles for this brand and transform
    const brandVehicles = (rawVehicles || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((v: any) => v.brand?.slug === route.brandSlug)
      .map((dv: Record<string, unknown>) => transformDirectusVehicle(dv as Record<string, unknown>))
      .filter((v: Vehicle | null): v is Vehicle => v !== null);

    // Extract hero block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = vehicleBrandPage?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;
    const heroIcon = vehicleBrandPage?.config?.hero?.icon || matchedBrand?.icon_simple || "Car";

    // Extract getquote block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = vehicleBrandPage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const tPrefix = "pages.vehicle-brand";
    const quoteEntry = registry.find((p) => p.id === "quote");
    const quoteSlug = quoteEntry?.slugs[lang];
    const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;

    const getQuoteData = getQuoteBlock ? {
      headline: t(dictionary, `${tPrefix}.blocks.getquote.headline`, { brand: brandName }),
      subheadline: t(dictionary, `${tPrefix}.blocks.getquote.subheadline`, { brand: brandName }),
      ctaLabel: t(dictionary, `${tPrefix}.blocks.getquote.cta.label`, { brand: brandName }),
      ctaHref,
      note: t(dictionary, `${tPrefix}.blocks.getquote.note`, { brand: brandName }),
      variant: getQuoteBlock.variant === "green" ? "primary" as const : "muted" as const,
      image: getQuoteBlock.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined,
    } : undefined;

    // JSON-LD breadcrumbs
    const SITE_URL = getSiteUrl();
    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: t(dictionary, "common.home"), url: `${SITE_URL}/${lang}` },
        { name: t(dictionary, "pages.vehicle.breadcrumb.vehicles"), url: `${SITE_URL}/${lang}/${slug}` },
        { name: t(dictionary, "pages.vehicle-brands.blocks.hero.headline"), url: `${SITE_URL}/${lang}/${slug}/${brandsSegment}` },
        { name: brandName, url: `${SITE_URL}/${lang}/${slug}/${brandsSegment}/${route.brandSlug}` },
      ]),
    );

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <VehicleBrandDetail
          brandName={brandName}
          brandSlug={route.brandSlug}
          vehicles={brandVehicles}
          lang={lang}
          vehiclesSegment={slug}
          brandsSegment={brandsSegment}
          dictionary={dictionary}
          pageRegistry={registry}
          heroIcon={heroIcon}
          heroImage={heroImage}
          getQuoteBlock={getQuoteData}
        />
      </>
    );
  }

  notFound();
}
