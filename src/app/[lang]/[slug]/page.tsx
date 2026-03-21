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
import { wrapInGraph, buildBreadcrumbList } from "@/lib/seo/jsonLd";
import { extractPageDictionary, extractLayoutDictionary, t } from "@/lib/i18n/dictionaries";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { ContactForm } from "@/components/ContactForm";
import { BlogListing } from "@/components/BlogListing";
import { VehicleBrandsListView } from "@/lib/vehicles/shared";
import { DIRECTUS_URL } from "@/lib/directus";
import { getDateLocale, getRouteSlug } from "@/lib/i18n/config";
import { resolveRouteLinks } from "@/lib/pageConfig";

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

  const registry = await fetchPageRegistry();

  // Interactive pages: render dedicated form components
  if (INTERACTIVE_PAGES.has(entry.id)) {
    if (entry.id === "quote") {
      return <QuoteForm lang={lang} dictionary={dictionary} quoteSlug={slug} />;
    }
    if (entry.id === "contact") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contactHeroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
      const contactHeroImage = contactHeroBlock?.image ? `${DIRECTUS_URL}/assets/${contactHeroBlock.image}` : undefined;
      return <ContactForm lang={lang} dictionary={dictionary} heroImage={contactHeroImage} />;
    }
  }

  // Blog listing page
  if (entry.id === "blog") {
    const blogPosts = await fetchBlogPosts(locale);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroTranslation = heroBlock?.translations?.[0];

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
        dictionary={dictionary}
        pageRegistry={registry}
        lang={lang}
      />
    );
  }

  // Vehicles listing page
  if (entry.id === "vehicles") {
    const [brands, vehicles] = await Promise.all([
      fetchVehicleBrands(locale),
      fetchVehicles(locale),
    ]);
    const brandsSegment = getRouteSlug(lang, "brands");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const heroBlock = page?.blocks?.find((b: any) => b?.collection === "block_hero")?.item;
    const heroTranslation = heroBlock?.translations?.[0];

    return (
      <div>
        {/* Hero */}
        <section className="py-16 md:py-24 bg-muted/30">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">
              {heroTranslation?.headline || t(dictionary, "pages.vehicles.blocks.hero.title")}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {t(dictionary, "pages.vehicles.vehiclesGrid.results.count_other", { count: vehicles.length })}
            </p>
          </div>
        </section>

        {/* Brands navigation */}
        <VehicleBrandsListView
          brands={brands}
          lang={lang}
          vehiclesSegment={slug}
          brandsSegment={brandsSegment}
          dictionary={dictionary}
        />

        {/* Vehicle grid */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {vehicles.map((vehicle: any) => {
                const name = `${vehicle.brand?.name || ""} ${vehicle.model || vehicle.name || ""}`.trim();
                const thumbnail = vehicle.thumbnail ? `${DIRECTUS_URL}/assets/${vehicle.thumbnail}` : null;
                const range = vehicle.range?.value ? `${vehicle.range.value} ${vehicle.range.unit || "km"}` : null;
                const battery = vehicle.battery?.value ? `${vehicle.battery.value} ${vehicle.battery.unit || "kWh"}` : null;

                return (
                  <a
                    key={vehicle.id}
                    href={`/${lang}/${slug}/${vehicle.slug}`}
                    className="border rounded-xl overflow-hidden hover:border-primary/50 transition-colors group"
                  >
                    {thumbnail && (
                      <div className="relative aspect-[16/10] bg-muted">
                        <img
                          src={thumbnail}
                          alt={name}
                          loading="lazy"
                          className="w-full h-full object-contain p-4 group-hover:scale-105 transition-transform"
                        />
                      </div>
                    )}
                    <div className="p-4">
                      {vehicle.brand?.name && (
                        <p className="text-xs text-primary font-medium mb-1">{vehicle.brand.name}</p>
                      )}
                      <h3 className="font-semibold mb-2">{name}</h3>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        {range && <span>{range}</span>}
                        {battery && <span>{battery}</span>}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    );
  }

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
                    className="text-muted-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: resolveRouteLinks(section.content, lang, registry) }}
                  />
                )}
              </section>
            ))
          ) : body ? (
            <div
              className="prose-headings:font-heading prose-headings:tracking-tight prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:font-medium hover:prose-a:underline prose-strong:text-foreground"
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
