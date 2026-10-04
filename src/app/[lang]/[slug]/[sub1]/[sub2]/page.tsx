import type { Metadata } from "next";
import { notFound } from "next/navigation";
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
import { resolveRouteLinks } from "@/lib/pageConfig";
import { GetQuote } from "@/components/GetQuote";
import { BlogArticle } from "@/components/blog/BlogArticle";
import type { PostCardData } from "@/components/home-b/PostCard";
import { opt } from "@/components/home-b/content";
import { deriveExcerpt } from "@/lib/blog-excerpt";
import { BrandIcon } from "@/lib/vehicles/shared";
import {
  ChevronRight,
  ChevronDown,
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

    // Lede: the editor's SEO description. `excerpt` does not exist on
    // blog_posts_translations, so the page has never had one before.
    const articleLede = decodeHtmlEntities(String(pt.seo?.meta_description || rawExcerpt || "").trim()) || undefined;
    const readingTimeText = (minutes: number) =>
      df("pages.blog-post.readingTime.label",
        df("shared.blogCard.readingTime.label_one", `${minutes} min`, { count: minutes }),
        { count: minutes });

    // Related: up to three other posts of the same category.
    const categoryKey = post.category?.category_id;
    const relatedRaw = categoryKey ? await fetchBlogPosts(locale, categoryKey) : [];
    const relatedPosts: PostCardData[] = relatedRaw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((rp: any) => String(rp.id) !== String(post.id))
      .slice(0, 3)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((rp: any) => {
        const rpt = rp.translations?.[0];
        const rct = rp.category?.translations?.[0];
        return {
          id: String(rp.id),
          title: rpt?.title || "",
          excerpt: deriveExcerpt(rpt, rpt?.title || ""),
          readingTime: parseReadingTime(rp.reading_time),
          image: rp.image ? `${DIRECTUS_URL}/assets/${rp.image}` : "/og-default.webp",
          category: rct?.name || categoryName,
          href: `/${lang}/${slug}/${rct?.slug || sub1}/${rpt?.slug || rp.slug || rp.id}`,
        };
      })
      .filter((rp: PostCardData) => rp.title);

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
        description: articleLede || articleTitle,
        imageUrl: absoluteImage,
        datePublished: post.date_published || post.date_created || "",
        dateModified: post.date_updated,
        categoryName,
        url: `${SITE_URL}${currentPath}`,
        langCode,
        authorName,
      }),
      !customSchemaHasFaq && faqItems.length > 0 ? buildFAQPage(faqItems) : null,
      // Flatten customSchema @graph items into our graph (avoid nested
      // @graph), dropping article-type entries: the code-built BlogPosting
      // above is authoritative, and editor-pasted Article schemas were
      // shipping a second article entity with stale hardcoded dates.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(Array.isArray((customSchema as any)?.["@graph"])
        ? (customSchema as any)["@graph"]
        : customSchema ? [customSchema] : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ).filter((s: any) => !["Article", "BlogPosting", "NewsArticle"].includes(s?.["@type"])),
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

        <BlogArticle
          lang={lang}
          labels={{
            back: df("pages.blog-post.subheader.back", lang === "de" ? "Zurück zum Blog" : "Retour au blog"),
            published: opt(dictionary, "pages.blog-post.published"),
            faqTitle: df("pages.blog-post.faq.title", lang === "de" ? "Häufige Fragen" : "Questions fréquentes"),
            expertAdviceTitle: df("pages.blog-post.expertAdvice.title", lang === "de" ? "Expertenrat" : "Conseil d'expert"),
            takeawaysTitle: df("pages.blog-post.takeaways.title", lang === "de" ? "Wichtige Erkenntnisse" : "Points clés"),
            authorLabel: opt(dictionary, "pages.blog-post.author.label"),
            relatedEyebrow: opt(dictionary, "pages.blog-post.related.eyebrow"),
            relatedTitle: opt(dictionary, "pages.blog-post.related.title"),
            relatedAll: opt(dictionary, "pages.blog-post.related.all"),
            relatedRead: opt(dictionary, "pages.blog-post.related.read"),
          }}
          blogHref={`/${lang}/${slug}`}
          categoryName={categoryName}
          tagNames={tagNames}
          readingTimeLabel={readingTimeText(readingTime)}
          title={articleTitle}
          lede={articleLede}
          author={authorName ? { name: authorName, credentials: authorCredentials, portrait: authorPortrait } : null}
          date={formattedDate}
          dateTime={dateValue || undefined}
          image={imageUrl}
          bodyHtml={safeBody}
          noContentLabel={df("pages.blog-post.noContent", lang === "de" ? "Kein Inhalt verfügbar." : "Aucun contenu disponible.")}
          faq={faqItems}
          expertAdviceHtml={expertAdvice || undefined}
          expertAdviceIcon={config.expertAdvice?.icon}
          takeawaysHtml={takeaways || undefined}
          takeawaysIcon={config.takeaways?.icon}
          related={relatedPosts}
          relatedReadingTime={readingTimeText}
          cta={
            hasGetQuoteBlock
              ? {
                  title: d("pages.blog-post.blocks.getquote.headline"),
                  subtitle: opt(dictionary, "pages.blog-post.blocks.getquote.subheadline"),
                  label: d("pages.blog-post.blocks.getquote.cta.label"),
                  href: quoteHref,
                  note: opt(dictionary, "pages.blog-post.blocks.getquote.note"),
                }
              : undefined
          }
          dictionary={dictionary}
          pageRegistry={registry}
        />
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
      // WebPage carries dateModified (GovernmentService is not a
      // CreativeWork and cannot). Same source as the visible "Dernière
      // mise à jour" line and the sitemap lastmod: subsidies_fetched_at —
      // the timestamp of the last subsidy-data sync for this locality.
      locality.subsidies_fetched_at
        ? {
            "@type": "WebPage",
            "@id": `${SITE_URL}${currentPath}`,
            url: `${SITE_URL}${currentPath}`,
            dateModified:
              locality.subsidies_fetched_at.endsWith("Z") ||
              locality.subsidies_fetched_at.includes("+")
                ? locality.subsidies_fetched_at
                : `${locality.subsidies_fetched_at}Z`,
            inLanguage: lang === "de" ? "de-CH" : "fr-CH",
          }
        : null,
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
