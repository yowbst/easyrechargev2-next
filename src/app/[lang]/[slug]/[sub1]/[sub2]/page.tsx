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
  fetchVehiclesByBrand,
  fetchVehicleBrands,
  fetchLocality,
  fetchAllLocalitySlugs,
  fetchCantonArticle,
  fetchPageRegistry,
  fetchLayout,
  fetchPage,
} from "@/lib/directus-queries";
import { VehicleBrandDetail } from "@/components/VehicleBrandDetail";
import { transformDirectusVehicle } from "@/lib/vehicleTransformer";
import type { Vehicle } from "@/lib/vehicleTransformer";
import Image from "next/image";
import { DIRECTUS_URL } from "@/lib/directus";
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
  buildFAQPage,
  buildGovernmentService,
} from "@/lib/seo/jsonLd";
import { LocalitySubsidiesPage } from "@/components/LocalitySubsidiesPage";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { resolveRouteLinks } from "@/lib/pageConfig";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { GetQuote } from "@/components/GetQuote";
import { LucideCmsIcon } from "@/components/LucideCmsIcon";
import { BrandIcon } from "@/lib/vehicles/shared";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
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
import { InfoTooltip } from "@/components/ui/info-tooltip";
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
  tooltip,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  tooltip?: string;
}) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        {tooltip ? <InfoTooltip content={tooltip}>{label}</InfoTooltip> : label}
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

  // Locality subsidy pages — skip static generation (8,150 pages).
  // dynamicParams = true ensures they render on-demand with ISR.

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
    const [brandVehicles, rawBrands, brandPage] = await Promise.all([
      fetchVehiclesByBrand(route.brandSlug, locale),
      fetchVehicleBrands(locale),
      fetchPage("vehicle-brand", locale),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matchedBrand = (rawBrands || []).find((b: any) => b.slug === route.brandSlug);
    const brandName = matchedBrand?.name || route.brandSlug;
    const vehicleCount = brandVehicles.length;

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

  // ── Locality subsidies ────────────────────────────────────────────
  if (route.type === "locality-subsidies") {
    const locale = slugToDirectusLocale(lang);
    const locality = await fetchLocality(route.localitySlug, locale);
    if (!locality) return {};

    const cantonName = locality.canton?.translations?.[0]?.name || locality.canton_2l;
    const ville = locality.name;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subsidies: any[] = locality.translations?.[0]?.subsidies || [];
    const personalCount = subsidies.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.audiences?.includes("personal"),
    ).length;

    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const otherLang = lang === "de" ? "fr" : "de";
    const otherLocalitiesSlug = getRouteSlug(otherLang, "localities");
    const otherSubsidiesSlug = getRouteSlug(otherLang, "subsidies");
    // Use translated slug if available, fall back to root slug
    const otherLocSlug = locality.translations?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (tr: any) => tr.languages_code === slugToDirectusLocale(otherLang),
    )?.slug || locality.slug;

    const title = lang === "de"
      ? `Förderung Ladestation in ${ville} (${cantonName})`
      : `Subventions borne de recharge à ${ville} (${cantonName})`;
    const description = lang === "de"
      ? `Förderprogramme für Ladestationen in ${ville} (${locality.postal_code}). ${personalCount} Programme verfügbar.`
      : `Aides pour installer une borne de recharge à ${ville} (${locality.postal_code}). ${personalCount} programmes disponibles.`;

    return buildMetadata({
      title: normalizeTitle(title),
      description: truncate(description),
      canonical: `${SITE_URL}${currentPath}`,
      ogType: "website",
      lang,
      alternates: buildAlternates({
        [lang]: currentPath,
        [otherLang]: `/${otherLang}/${otherLocalitiesSlug}/${otherLocSlug}/${otherSubsidiesSlug}`,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const faqItems: Array<{ question: string; answer: string }> = Array.isArray(pt.faq_json) ? pt.faq_json : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customSchema: Record<string, unknown> | null = pt.schema_json && typeof pt.schema_json === "object" ? pt.schema_json as Record<string, unknown> : null;
    const categoryName = ct?.name || df("pages.blog-post.defaultCategory", "Guide");
    const readingTime = parseReadingTime(post.reading_time);

    // Author
    const author = post.author;
    const authorName = author?.name || null;
    const authorCredentials = author?.translations?.[0]?.credentials || null;
    const authorPortrait = author?.portrait ? `${DIRECTUS_URL}/assets/${author.portrait}` : null;

    // Tags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tagNames: string[] = (post.tags || []).map((tj: any) => {
      const tag = tj?.blog_tags_id;
      return tag?.translations?.[0]?.name || tag?.name || null;
    }).filter(Boolean);

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

    // Check if customSchema already contains a FAQPage to avoid duplicates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const customSchemaHasFaq = customSchema && (
      (customSchema as any)["@type"] === "FAQPage" ||
      Array.isArray((customSchema as any)["@graph"]) &&
        (customSchema as any)["@graph"].some((s: any) => s?.["@type"] === "FAQPage")
    );

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
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
      !customSchemaHasFaq && faqItems.length > 0 ? buildFAQPage(faqItems) : null,
      customSchema,
    );

    // Strip Directus WYSIWYG editor classes/attributes and trailing <hr>, then resolve internal links
    const cleanBody = articleBody
      .replace(/\s?class="css-[^"]*"/g, "")
      .replace(/\s?data-slate-[a-z-]*="[^"]*"/g, "")
      .replace(/\s?data-slate-[a-z-]*/g, "")
      .replace(/(<hr\s*\/?>[\s\n]*)+$/i, "");
    const safeBody = resolveRouteLinks(cleanBody, lang, registry);

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
            <Image
              src={imageUrl}
              alt={articleTitle}
              fill
              priority
              quality={65}
              sizes="(max-width: 640px) 640px, (max-width: 1024px) 1024px, 1200px"
              className="object-cover"
              data-testid="img-article-hero"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 text-white">
              <div className="container mx-auto px-4 pb-8 md:pb-12">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <Badge
                      className="bg-white/15 text-white hover:bg-white/25 border-white/20 backdrop-blur-sm text-xs font-medium tracking-wide uppercase"
                      data-testid="badge-article-category"
                    >
                      {categoryName}
                    </Badge>
                    {tagNames.map((tag) => (
                      <Badge
                        key={tag}
                        className="bg-white/10 text-white/80 border-white/15 backdrop-blur-sm text-xs font-medium"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
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
                    {authorName && (
                      <>
                        <span className="text-white/40" aria-hidden="true">|</span>
                        <div className="flex items-center gap-1.5">
                          {authorPortrait && (
                            <Image
                              src={authorPortrait}
                              alt={authorName}
                              width={20}
                              height={20}
                              className="rounded-full ring-1 ring-white/30"
                            />
                          )}
                          <span>{authorName}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Article content + sidebar */}
          <section className="py-10 md:py-16">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-10 lg:gap-12">
                  {/* Main article column */}
                  <article className="min-w-0">
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
                        "prose dark:prose-invert max-w-none",
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


                    {/* FAQ */}
                    {faqItems.length > 0 && (
                      <div className="mt-10">
                        <h2 className="text-xl sm:text-2xl font-heading font-bold mb-4">
                          {df("pages.blog-post.faq.title", lang === "de" ? "Häufige Fragen" : "Questions fréquentes")}
                        </h2>
                        <Accordion className="w-full">
                          {faqItems.map((item, index) => (
                            <AccordionItem key={index} value={`faq-${index}`}>
                              <AccordionTrigger className="text-left hover:no-underline w-full justify-between gap-4">
                                {item.question}
                              </AccordionTrigger>
                              <AccordionContent>
                                <p className="text-sm text-muted-foreground leading-relaxed">
                                  {item.answer}
                                </p>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </div>
                    )}
                  </article>

                  {/* Sidebar */}
                  <aside>
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
                            <blockquote className="text-sm leading-loose text-foreground/80 border-l-2 border-primary/30 pl-3">
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
                              className="prose prose-sm dark:prose-invert max-w-none prose-p:text-sm prose-p:leading-loose prose-li:text-sm prose-li:leading-loose prose-ul:my-3 prose-ol:my-3 prose-li:my-1.5 prose-p:text-foreground/80 prose-li:text-foreground/80"
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


  // Vehicle model detail route removed — not sitemapped, not indexed.
  // Canonical vehicle URL is /{lang}/{vehiclesSlug}/{vehicleSlug} (sub1 page).
  if (route.type === "vehicle-model-detail") notFound();


  // ── Vehicle brand detail ───────────────────────────────────────────
  if (route.type === "vehicle-brand-detail") {
    const [rawVehicles, rawBrands, layoutData, vehicleBrandPage, vehicleTemplatePage, registry] = await Promise.all([
      fetchVehiclesByBrand(route.brandSlug, locale),
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

    // Transform vehicles (already filtered by brand from Directus)
    const brandVehicles = (rawVehicles || [])
      .map((dv: Record<string, unknown>) => transformDirectusVehicle(dv as Record<string, unknown>))
      .filter((v: Vehicle | null): v is Vehicle => v !== null);

    // Extract hero block
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = vehicleBrandPage?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;
    const heroIcon = vehicleBrandPage?.config?.hero?.icon || matchedBrand?.icon_simple || "Car";
    const heroIconSvg = matchedBrand?.icon_svg || null;

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
        { name: t(dictionary, "pages.vehicle.breadcrumb.vehicles") === "pages.vehicle.breadcrumb.vehicles" ? (lang === "de" ? "Fahrzeuge" : "Véhicules") : t(dictionary, "pages.vehicle.breadcrumb.vehicles"), url: `${SITE_URL}/${lang}/${slug}` },
        { name: t(dictionary, "pages.vehicle-brands.blocks.hero.headline") === "pages.vehicle-brands.blocks.hero.headline" ? (lang === "de" ? "Marken" : "Marques") : t(dictionary, "pages.vehicle-brands.blocks.hero.headline"), url: `${SITE_URL}/${lang}/${slug}/${brandsSegment}` },
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
          heroIconSvg={heroIconSvg}
          heroImage={heroImage}
          getQuoteBlock={getQuoteData}
        />
      </>
    );
  }

  // ── Locality subsidies ─────────────────────────────────────────
  if (route.type === "locality-subsidies") {
    const [locality, layoutData, localitiesPage, registry] = await Promise.all([
      fetchLocality(route.localitySlug, locale),
      fetchLayout(locale),
      fetchPage("locality-subsidies", locale),
      fetchPageRegistry(),
    ]);
    if (!locality) notFound();

    const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
    const pageDict = localitiesPage ? extractPageDictionary("locality-subsidies", localitiesPage, locale) : {};
    const dictionary = { ...layoutDict, ...pageDict };

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
    const d = (key: string, vars?: Record<string, string | number>) => {
      const val = t(dictionary, key, vars);
      return val === key ? `[${key}]` : val;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subsidies: any[] = locality.translations?.[0]?.subsidies || [];
    const cantonName = locality.canton?.translations?.[0]?.name || locality.canton_2l;

    // Canton article
    const cantonArticleRaw = await fetchCantonArticle(locality.canton_2l, locale);
    let cantonArticle: { title: string; href: string } | null = null;
    if (cantonArticleRaw) {
      const blogEntry = registry.find((p) => p.id === "blog");
      const blogSlug = blogEntry?.slugs[lang] || "blog";
      const artTranslation = cantonArticleRaw.translations?.[0];
      const catTranslation = cantonArticleRaw.category?.translations?.[0];
      if (artTranslation?.slug && catTranslation?.slug) {
        cantonArticle = {
          title: artTranslation.title || d("pages.locality-subsidies.links.cantonArticle", { canton: cantonName }),
          href: `/${lang}/${blogSlug}/${catTranslation.slug}/${artTranslation.slug}`,
        };
      }
    }

    // Quote href
    const quoteEntry = registry.find((p) => p.id === "quote");
    const quoteHref = quoteEntry ? `/${lang}/${quoteEntry.slugs[lang]}` : `/${lang}`;

    // JSON-LD
    const SITE_URL = getSiteUrl();
    const currentPath = `/${lang}/${slug}/${sub1}/${sub2}`;
    const localitiesLabel = d("pages.locality-subsidies.breadcrumb.localities");
    const subsidiesLabel = d("pages.locality-subsidies.breadcrumb.subsidies");

    const chargingSubsidies = subsidies.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (s: any) => s.category === "charging-infrastructure",
    );

    const jsonLd = wrapInGraph(
      buildBreadcrumbList([
        { name: localitiesLabel, url: `${SITE_URL}/${lang}/${slug}` },
        { name: locality.name, url: `${SITE_URL}/${lang}/${slug}/${sub1}` },
        { name: subsidiesLabel, url: `${SITE_URL}${currentPath}` },
      ]),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...chargingSubsidies.slice(0, 3).map((s: any) =>
        buildGovernmentService({
          name: s.name,
          description: s.description?.slice(0, 200) || "",
          providerName: s.contributor?.name || "",
          areaServed: { name: locality.name, postalCode: locality.postal_code },
          url: s.site_url || undefined,
        }),
      ),
      subsidies.length > 0 ? buildFAQPage([
        {
          question: lang === "de"
            ? `Welche Förderungen gibt es für Ladestationen in ${locality.name}?`
            : `Quelles subventions pour une borne de recharge à ${locality.name} ?`,
          answer: lang === "de"
            ? `${subsidies.length} Förderprogramme sind in ${locality.name} (${locality.postal_code}) verfügbar.`
            : `${subsidies.length} programmes de subventions sont disponibles à ${locality.name} (${locality.postal_code}).`,
        },
      ]) : null,
    );

    // GetQuote
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = localitiesPage?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;

    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <LocalitySubsidiesPage
          locality={{
            name: locality.name,
            postalCode: locality.postal_code,
            canton2l: locality.canton_2l,
            cantonName,
            subsidiesFetchedAt: locality.subsidies_fetched_at,
          }}
          subsidies={subsidies}
          cantonArticle={cantonArticle}
          dictionary={dictionary}
          pageRegistry={registry}
          lang={lang}
          quoteHref={quoteHref}
        />
        {getQuoteBlock && (
          <GetQuote
            title={d("pages.locality-subsidies.cta.title")}
            subtitle={d("pages.locality-subsidies.cta.subtitle")}
            ctaLabel={d("pages.locality-subsidies.cta.label")}
            ctaHref={quoteHref}
            variant={getQuoteBlock.variant === "green" ? "primary" : "muted"}
            image={getQuoteBlock.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined}
          />
        )}
      </>
    );
  }

  notFound();
}
