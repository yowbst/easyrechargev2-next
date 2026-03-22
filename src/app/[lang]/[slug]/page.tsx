import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchPageRegistry, fetchLayout, fetchBlogPosts, fetchVehicles, fetchVehicleBrands } from "@/lib/directus-queries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  normalizeTitle,
  truncate,
  extractItemSEO,
  resolveSEOFieldMappings,
  resolveOgImage,
  buildAlternates,
  getSiteUrl,
} from "@/lib/seo/resolver";
import { wrapInGraph, buildBreadcrumbList, buildFAQPage } from "@/lib/seo/jsonLd";
import { extractPageDictionary, extractLayoutDictionary, t } from "@/lib/i18n/dictionaries";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { ContactForm } from "@/components/ContactForm";
import { BlogListing } from "@/components/BlogListing";
import { VehicleBrandsListView } from "@/lib/vehicles/shared";
import { VehiclesHub } from "@/components/VehiclesHub";
import { transformDirectusVehicle, type Vehicle } from "@/lib/vehicleTransformer";
import { DIRECTUS_URL } from "@/lib/directus";
import { getDateLocale, getRouteSlug } from "@/lib/i18n/config";
import { resolveRouteId, resolveRouteLinks } from "@/lib/pageConfig";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { ProcessSteps } from "@/components/ProcessSteps";
import { FAQ } from "@/components/FAQ";
import { GetQuote } from "@/components/GetQuote";
import { Testimonials } from "@/components/Testimonials";
import { GuideCarousel } from "@/components/GuideCarousel";
import { SwissMap } from "@/components/SwissMap";
import { MiniQuoteForm } from "@/components/MiniQuoteForm";

interface SlugPageProps {
  params: Promise<{ lang: string; slug: string }>;
}

export async function generateStaticParams() {
  const registry = await fetchPageRegistry();
  const params: { lang: string; slug: string }[] = [];
  for (const entry of registry) {
    for (const [lang, slug] of Object.entries(entry.slugs)) {
      if (slug) params.push({ lang, slug });
    }
  }
  return params;
}

export const dynamicParams = true;

/** Find the page registry entry matching this slug for the given language. */
async function resolvePageEntry(slug: string, lang: string) {
  const registry = await fetchPageRegistry();
  return registry.find((p) => p.slugs[lang] === slug) || null;
}

export async function generateMetadata({
  params,
}: SlugPageProps): Promise<Metadata> {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) return {};

  const entry = await resolvePageEntry(slug, lang);
  if (!entry) return {};

  const locale = slugToDirectusLocale(lang);
  const page = await fetchPage(entry.id, locale);
  const translation = page?.translations?.[0];
  const seo = extractItemSEO(translation?.seo);
  const resolved = resolveSEOFieldMappings(seo);

  const SITE_URL = getSiteUrl();
  const langPaths: Record<string, string> = {};
  for (const [l, s] of Object.entries(entry.slugs)) {
    langPaths[l] = `/${l}/${s}`;
  }

  const heroBlock = page?.blocks?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b?.collection === "block_hero",
  );

  return buildMetadata({
    title: normalizeTitle(resolved?.title || translation?.title || slug),
    description: truncate(resolved?.description || ""),
    canonical: `${SITE_URL}/${lang}/${slug}`,
    ogImage: resolveOgImage(resolved, undefined, heroBlock?.item?.image),
    ogType: "website",
    lang,
    alternates: buildAlternates(langPaths),
  });
}

/** Route IDs that render interactive forms instead of content pages. */
const INTERACTIVE_PAGES = new Set(["quote", "contact"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBlock(blocks: any[], collection: string) {
  return blocks?.find((b: AnyRecord) => b?.collection === collection)?.item;
}

export default async function SlugPage({ params }: SlugPageProps) {
  const { lang, slug } = await params;
  if (!isValidLang(lang)) notFound();

  const entry = await resolvePageEntry(slug, lang);
  if (!entry) notFound();

  const locale = slugToDirectusLocale(lang);
  const [page, layoutData] = await Promise.all([
    fetchPage(entry.id, locale),
    fetchLayout(locale),
  ]);
  if (!page) notFound();

  const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
  const pageDict = extractPageDictionary(entry.id, page, locale);
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

  const registry = await fetchPageRegistry();

  // Interactive pages: render dedicated form components
  if (INTERACTIVE_PAGES.has(entry.id)) {
    if (entry.id === "quote") {
      const logoSrc = layoutData?.logo_color ? `${DIRECTUS_URL}/assets/${layoutData.logo_color}` : undefined;
      const logoDarkSrc = layoutData?.logo_white ? `${DIRECTUS_URL}/assets/${layoutData.logo_white}` : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const quoteHeroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
      const quoteHeroImage = quoteHeroBlock?.image ? `${DIRECTUS_URL}/assets/${quoteHeroBlock.image}` : undefined;
      const quotePageConfig = page?.config || {};
      const globalConfig = layoutData?.globalConfig ?? {};
      return (
        <QuoteForm
          lang={lang}
          dictionary={dictionary}
          quoteSlug={slug}
          logoSrc={logoSrc}
          logoDarkSrc={logoDarkSrc}
          heroImage={quoteHeroImage}
          pageConfig={quotePageConfig}
          globalConfig={globalConfig}
          pageRegistry={registry}
        />
      );
    }
    if (entry.id === "contact") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactHeroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
      const contactHeroImage = contactHeroBlock?.image ? `${DIRECTUS_URL}/assets/${contactHeroBlock.image}` : undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactGetQuoteBlock = page?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
      const contactGetQuoteData = contactGetQuoteBlock
        ? { variant: contactGetQuoteBlock.variant, image: contactGetQuoteBlock.image ? `${DIRECTUS_URL}/assets/${contactGetQuoteBlock.image}` : undefined }
        : undefined;
      return (
        <ContactForm
          lang={lang}
          dictionary={dictionary}
          heroImage={contactHeroImage}
          getQuoteBlock={contactGetQuoteData}
          pageRegistry={registry}
        />
      );
    }
  }

  // Blog listing page
  if (entry.id === "blog") {
    const blogPosts = await fetchBlogPosts(locale);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroTranslation = heroBlock?.translations?.[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = page?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;

    const parseReadingTime = (v: unknown): number => {
      if (!v) return 5;
      if (typeof v === "number") return v;
      const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
      if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return parseInt(String(v), 10) || 5;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transformedPosts = blogPosts.map((post: any) => {
      const pt = post.translations?.[0];
      const ct = post.category?.translations?.[0];
      const tags = (post.tags || [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((tj: any) => {
          const tag = tj?.blog_tags_id;
          const tt = tag?.translations?.[0];
          if (!tag) return null;
          return { id: tag.tag_id || tag.id, name: tt?.name || tag.tag_id || "", slug: tt?.slug || "" };
        })
        .filter(Boolean);
      const dateValue = post.date_published || post.date_created;
      return {
        id: String(post.id),
        title: pt?.title || "",
        excerpt: pt?.excerpt || "",
        slug: pt?.slug || post.slug || String(post.id),
        readingTime: parseReadingTime(post.reading_time),
        image: post.image ? `${DIRECTUS_URL}/assets/${post.image}` : "/og-default.webp",
        date: dateValue ? new Date(dateValue).toLocaleDateString(getDateLocale(lang), { day: "numeric", month: "short", year: "numeric" }) : "",
        category: ct?.name || "Guide",
        categorySlug: ct?.slug || "guide",
        categoryId: post.category?.category_id || post.category?.key || post.category?.id || "",
        tags,
      };
    });

    return (
      <BlogListing
        posts={transformedPosts}
        heroTitle={heroTranslation?.headline || t(dictionary, "pages.blog.blocks.hero.headline")}
        heroSubtitle={heroTranslation?.subheadline || t(dictionary, "pages.blog.blocks.hero.subheadline")}
        heroImage={heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined}
        guideSectionTitle={t(dictionary, "pages.blog.rechargingGuide.headline")}
        guideSectionSubtitle={t(dictionary, "pages.blog.rechargingGuide.subheadline", { count: transformedPosts.length })}
        getQuoteBlock={getQuoteBlock ? { variant: getQuoteBlock.variant, image: getQuoteBlock.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined } : undefined}
        dictionary={dictionary}
        pageRegistry={registry}
        lang={lang}
      />
    );
  }

  // Vehicles listing page
  if (entry.id === "vehicles") {
    const [rawBrands, rawVehicles, vehicleTemplatePage] = await Promise.all([
      fetchVehicleBrands(locale),
      fetchVehicles(locale),
      fetchPage("vehicle", locale),
    ]);

    // Merge vehicle template translations (pages.vehicle.card.*) into dictionary
    if (vehicleTemplatePage) {
      const vehicleDict = extractPageDictionary("vehicle", vehicleTemplatePage, locale);
      Object.assign(dictionary, vehicleDict);
    }

    // Transform raw Directus vehicles to typed Vehicle objects
    const transformedVehicles: Vehicle[] = rawVehicles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((dv: any) => transformDirectusVehicle(dv))
      .filter((v): v is Vehicle => v !== null);

    // Pass plain serializable brand data — icons are resolved client-side
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const brandNames = rawBrands.map((brand: any) => ({
      name: String(brand.name || ""),
      iconName: brand.icon_simple || null,
    }));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroTranslation = heroBlock?.translations?.[0];
    const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getQuoteBlock = page?.blocks?.find((b: any) => b?.collection === "block_getquote")?.item;
    const tPrefix = `pages.${entry.id}`;
    const quoteEntry = registry.find((p) => p.id === "quote");
    const quoteSlug = quoteEntry?.slugs[lang];
    const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;

    const getQuoteData = getQuoteBlock ? {
      headline: t(dictionary, `${tPrefix}.blocks.getquote.headline`),
      subheadline: t(dictionary, `${tPrefix}.blocks.getquote.subheadline`),
      ctaLabel: t(dictionary, `${tPrefix}.blocks.getquote.cta.label`),
      ctaHref,
      note: t(dictionary, `${tPrefix}.blocks.getquote.note`),
      image: getQuoteBlock.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined,
    } : undefined;

    return (
      <VehiclesHub
        vehicles={transformedVehicles}
        brands={brandNames}
        lang={lang}
        slug={slug}
        dictionary={dictionary}
        pageRegistry={registry}
        heroTitle={heroTranslation?.headline || t(dictionary, `${tPrefix}.blocks.hero.headline`)}
        heroSubtitle={t(dictionary, `${tPrefix}.blocks.hero.subheadline`, { count: transformedVehicles.length })}
        heroImage={heroImage}
        getQuoteBlock={getQuoteData}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // Block-based pages: dynamically render CMS blocks in order
  // ---------------------------------------------------------------------------
  const blocks = page?.blocks || [];
  const tPrefix = `pages.${entry.id}`;

  // Check if page has renderable blocks (beyond what content pages use)
  const RENDERABLE_BLOCK_TYPES = new Set([
    "block_hero", "block_features", "block_process", "block_faq",
    "block_testimonials", "block_getquote", "block_postgroup",
    "block_swissmap", "block_miniquote",
  ]);
  const hasRenderableBlocks = blocks.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b?.collection && RENDERABLE_BLOCK_TYPES.has(b.collection),
  );

  if (hasRenderableBlocks) {
    const gc = layoutData?.global_config || {};
    const stats = gc?.stats || {};
    const trustpilot = gc?.trustpilot || {};
    const slaNumVars = {
      quote_request_duration: slas?.quote_request_duration?.value ?? 3,
      first_contact: slas?.first_contact?.value ?? 48,
      quote_delivery_timeline: slas?.quote_delivery_timeline?.value ?? "3-5",
    };

    const quoteEntry = registry.find((p) => p.id === "quote");
    const quoteSlug = quoteEntry?.slugs[lang];
    const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;
    const blogEntry = registry.find((p) => p.id === "blog");
    const blogSlug = blogEntry?.slugs[lang] || "blog";

    // Breadcrumb
    const SITE_URL = getSiteUrl();
    const heroBlock = findBlock(blocks, "block_hero");
    const heroTranslation = heroBlock?.translations?.[0];
    const pageTitle = heroTranslation?.headline || page?.translations?.[0]?.title || entry.id;

    const schemas: AnyRecord[] = [
      buildBreadcrumbList([
        { name: t(dictionary, "common.home"), url: `${SITE_URL}/${lang}` },
        { name: pageTitle, url: `${SITE_URL}/${lang}/${slug}` },
      ]),
    ];

    // FAQ JSON-LD
    const faqBlock = findBlock(blocks, "block_faq");
    const faqItems = faqBlock?.faq_items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.map((junction: any) => {
        const item = junction?.faq_items_id;
        if (!item?.translations) return null;
        const trans =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          item.translations.find((tr: any) => tr.languages_code === locale) ||
          item.translations[0];
        if (!trans?.question || !trans?.answer) return null;
        return { id: String(item.id), question: trans.question, answer: trans.answer };
      })
      .filter(Boolean) as Array<{ id: string; question: string; answer: string }> || [];

    if (faqItems.length) {
      schemas.push(
        buildFAQPage(faqItems.map((f) => ({ question: f.question, answer: f.answer.replace(/<[^>]+>/g, "") }))),
      );
    }
    const jsonLd = wrapInGraph(...schemas);

    // Parse reading time helper for blog post blocks
    const parseReadingTime = (v: unknown): number => {
      if (!v) return 5;
      if (typeof v === "number") return v;
      const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
      if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
      return parseInt(String(v), 10) || 5;
    };

    return (
      <>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />

        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {blocks.map((block: any, index: number) => {
          const collection = block?.collection;
          const item = block?.item;
          if (!collection || !item) return null;

          switch (collection) {
            case "block_hero": {
              const trans = item.translations?.[0];
              const title = trans?.headline || t(dictionary, `${tPrefix}.blocks.hero.title`);
              const subtitleRaw = trans?.subheadline || t(dictionary, `${tPrefix}.blocks.hero.subtitle`);
              const subtitle = Object.entries(slaNumVars).reduce(
                (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
                subtitleRaw,
              );
              const image = item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined;
              const translationChecks = trans?.content?.checks;
              const checksConfig = translationChecks
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ? translationChecks.map((_: any, i: number) => String(i))
                : undefined;
              const checksMap: Record<string, string> = {};
              if (translationChecks) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                translationChecks.forEach((_: any, i: number) => {
                  const val = t(dictionary, `${tPrefix}.blocks.hero.checks.${i}`);
                  if (val !== `${tPrefix}.blocks.hero.checks.${i}` && !val.startsWith("[")) {
                    checksMap[String(i)] = val;
                  }
                });
              }
              const heroRatingTemplate = t(dictionary, `${tPrefix}.blocks.hero.rating`);
              const rating = stats.installations && trustpilot.score
                ? heroRatingTemplate.startsWith("[")
                  ? `${stats.installations}+ installations · ${trustpilot.score}/5 Trustpilot`
                  : heroRatingTemplate.replace("{installations}", String(stats.installations)).replace("{score}", String(trustpilot.score))
                : undefined;

              // Check if there's a mini-quote block right after hero
              const miniQuoteBlock = findBlock(blocks, "block_miniquote");

              return (
                <section key={index} id="hero">
                  <Hero
                    title={title}
                    subtitle={subtitle}
                    checksConfig={checksConfig}
                    checks={checksMap}
                    rating={rating}
                    image={image}
                    pageId={entry.id}
                  >
                    {miniQuoteBlock && (
                      <MiniQuoteForm
                        miniQuoteContent={miniQuoteBlock ? { config: miniQuoteBlock.config } : undefined}
                        pageId={entry.id}
                        dictionary={dictionary}
                        pageRegistry={registry}
                        lang={lang}
                        tOptions={{
                          quote_request_duration: slaNumVars.quote_request_duration,
                        }}
                      />
                    )}
                  </Hero>
                </section>
              );
            }

            case "block_miniquote":
              // Rendered inside Hero block above
              return null;

            case "block_features":
              return (
                <section key={index} id="features">
                  <Features
                    title={t(dictionary, `${tPrefix}.features.title`)}
                    subtitle={t(dictionary, `${tPrefix}.features.subtitle`)}
                    tPrefix={tPrefix}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                    dictionary={dictionary}
                  />
                </section>
              );

            case "block_process":
              return (
                <section key={index} id="process">
                  <ProcessSteps
                    title={t(dictionary, `${tPrefix}.process.title`)}
                    subtitle={t(dictionary, `${tPrefix}.process.subtitle`)}
                    tPrefix={tPrefix}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                    tOptions={{
                      first_contact: slaNumVars.first_contact,
                      quote_delivery_timeline: slaNumVars.quote_delivery_timeline,
                      quote_request_duration: slaNumVars.quote_request_duration,
                    }}
                    dictionary={dictionary}
                  />
                </section>
              );

            case "block_faq": {
              if (!faqItems.length) return null;
              const faqTranslation = item.translations?.[0];
              const faqCta = faqTranslation?.ctas?.[0];
              const faqCtaHref = faqCta?.page_route_id
                ? resolveRouteId(faqCta.page_route_id, lang, registry) || `/${lang}`
                : undefined;
              return (
                <section key={index} id="faq">
                  <FAQ
                    title={faqTranslation?.headline || t(dictionary, `${tPrefix}.blocks.faq.title`)}
                    subtitle={faqTranslation?.subheadline || undefined}
                    items={faqItems}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                    ctaLabel={faqCta?.label}
                    ctaHref={faqCtaHref}
                    ctaVariant={faqCta?.variant}
                    lang={lang}
                    pageRegistry={registry}
                  />
                </section>
              );
            }

            case "block_testimonials": {
              const config = item.config || {};
              const ratings = config?.testimonialsSection?.ratings || {};
              const itemIds = Object.keys(ratings).length > 0
                ? Object.keys(ratings)
                : ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8"];
              const testimonialItems = itemIds
                .filter((id) => {
                  const name = t(dictionary, `${tPrefix}.blocks.testimonials.items.${id}.name`);
                  return !name.startsWith("[");
                })
                .map((id) => ({
                  id,
                  rating: typeof ratings[id] === "number" ? ratings[id] : 5,
                }));
              if (!testimonialItems.length) return null;
              return (
                <section key={index} id="testimonials">
                  <Testimonials
                    headline={t(dictionary, `${tPrefix}.blocks.testimonials.title`)}
                    subheadline={t(dictionary, `${tPrefix}.blocks.testimonials.subtitle`)}
                    itemsConfig={testimonialItems}
                    pageId={entry.id}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                    dictionary={dictionary}
                  />
                </section>
              );
            }

            case "block_getquote":
              return (
                <section key={index} id="getquote">
                  <GetQuote
                    title={t(dictionary, `${tPrefix}.blocks.getquote.headline`)}
                    subtitle={t(dictionary, `${tPrefix}.blocks.getquote.subheadline`)}
                    ctaLabel={t(dictionary, `${tPrefix}.blocks.getquote.cta.label`)}
                    ctaHref={ctaHref}
                    note={t(dictionary, `${tPrefix}.blocks.getquote.note`)}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                  />
                </section>
              );

            case "block_postgroup": {
              const pgTranslation = item.translations?.[0];
              const posts = (item.posts || [])
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .map((junction: any) => {
                  const post = junction?.blog_posts_id;
                  if (!post) return null;
                  const pt = post.translations?.[0];
                  if (!pt?.title) return null;
                  const firstTag = post.tags?.[0]?.blog_tags_id;
                  return {
                    id: String(post.id),
                    title: pt.title,
                    excerpt: pt.excerpt || "",
                    readingTime: parseReadingTime(post.reading_time || pt.reading_time),
                    image: post.image ? `${DIRECTUS_URL}/assets/${post.image}` : "/og-default.webp",
                    category: post.category?.translations?.[0]?.name || "Guide",
                    categorySlug: post.category?.translations?.[0]?.slug || "guide",
                    slug: pt.slug || post.slug || String(post.id),
                    tag: firstTag?.translations?.[0]?.name || firstTag?.name || undefined,
                  };
                })
                .filter(Boolean) as Array<{
                id: string; title: string; excerpt: string; readingTime: number;
                image: string; category: string; categorySlug: string; slug: string; tag?: string;
              }>;
              if (!posts.length) return null;
              return (
                <section key={index} id="recharging-guide">
                  <GuideCarousel
                    title={pgTranslation?.headline || t(dictionary, `${tPrefix}.blocks.postgroup.title`)}
                    subtitle={pgTranslation?.subheadline || t(dictionary, `${tPrefix}.blocks.postgroup.subtitle`)}
                    ctaLabel={pgTranslation?.ctas?.[0]?.label || t(dictionary, `${tPrefix}.blocks.postgroup.cta.label`)}
                    ctaHref={`/${lang}/${blogSlug}`}
                    posts={posts}
                    image={item.image ? `${DIRECTUS_URL}/assets/${item.image}` : undefined}
                    dictionary={dictionary}
                    pageRegistry={registry}
                  />
                </section>
              );
            }

            case "block_swissmap":
              return (
                <section key={index} id="location">
                  <SwissMap
                    title={t(dictionary, `${tPrefix}.location.title`)}
                    subtitle={t(dictionary, `${tPrefix}.location.subtitle`)}
                    activeCantons={page?.config?.location?.activeCantons || ["GE", "VD", "FR", "VS"]}
                    statsConfig={[
                      { id: "cantonsCovered", icon: "Pin", value: stats.cantons ?? 4 },
                      { id: "certifiedInstallers", icon: "CheckCircle", value: stats.partners ?? 1 },
                      { id: "installationsDone", icon: "Zap", value: stats.installations ?? 550 },
                    ]}
                    tPrefix={tPrefix}
                    dictionary={dictionary}
                  />
                </section>
              );

            default:
              return null;
          }
        })}
      </>
    );
  }

  // ---------------------------------------------------------------------------
  // Content pages: prose HTML fallback (legal, privacy, etc.)
  // ---------------------------------------------------------------------------
  const translation = page?.translations?.[0];
  const content = translation?.content;
  const body = translation?.body;
  const title =
    content?.hero?.title || translation?.title || entry.id;

  // Breadcrumb JSON-LD
  const SITE_URL = getSiteUrl();
  const breadcrumbJsonLd = wrapInGraph(
    buildBreadcrumbList([
      {
        name: t(dictionary, "common.home"),
        url: `${SITE_URL}/${lang}`,
      },
      { name: title, url: `${SITE_URL}/${lang}/${slug}` },
    ]),
  );

  const hasContentSections =
    content?.sections && content.sections.length > 0;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-3xl md:text-4xl font-heading font-bold mb-6">
          {title}
        </h1>

        {content?.lastUpdated && (
          <p className="text-sm text-muted-foreground mb-8">
            {t(dictionary, "common.lastUpdated")}{" "}
            {content.lastUpdated}
          </p>
        )}

        <div className="prose prose-lg dark:prose-invert max-w-none">
          {hasContentSections ? (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content.sections.map((section: any, index: number) => (
              <section key={index} className="mb-8">
                {section.heading && (
                  <h2 className="text-xl md:text-2xl font-heading font-semibold mb-4">
                    {section.heading}
                  </h2>
                )}
                {section.content && (
                  <div
                    className="text-muted-foreground leading-relaxed whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: resolveRouteLinks(section.content, lang, registry) }}
                  />
                )}
              </section>
            ))
          ) : body ? (
            <div
              className="prose-headings:font-heading prose-headings:tracking-tight prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-foreground prose-ul:text-foreground prose-ol:text-foreground prose-a:text-primary prose-a:font-medium hover:prose-a:underline prose-strong:text-foreground prose-strong:font-semibold prose-blockquote:border-l-primary/40 prose-blockquote:text-foreground/75"
              dangerouslySetInnerHTML={{ __html: resolveRouteLinks(body, lang, registry) }}
            />
          ) : (
            <p className="text-muted-foreground">
              {t(dictionary, "common.noContent")}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
