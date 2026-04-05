import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchLayout, fetchPageRegistry } from "@/lib/directus-queries";
import { extractPageDictionary, extractLayoutDictionary, t } from "@/lib/i18n/dictionaries";
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
import {
  wrapInGraph,
  buildOrganization,
  buildWebSite,
  buildBreadcrumbList,
  buildFAQPage,
} from "@/lib/seo/jsonLd";
import { DIRECTUS_URL } from "@/lib/directus";
import { resolveRouteId } from "@/lib/pageConfig";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { ProcessSteps } from "@/components/ProcessSteps";
import { FAQ } from "@/components/FAQ";
import { GetQuote } from "@/components/GetQuote";
import { LazyTestimonials as Testimonials } from "@/components/lazy";
import { LazyGuideCarousel as GuideCarousel } from "@/components/lazy";
import { LazySwissMap as SwissMap } from "@/components/lazy";
import { MiniQuoteForm } from "@/components/MiniQuoteForm";

export function generateStaticParams() {
  return [{ lang: "fr" }, { lang: "de" }];
}

interface HomeProps {
  params: Promise<{ lang: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findBlock(blocks: any[], collection: string) {
  return blocks?.find((b: AnyRecord) => b?.collection === collection)?.item;
}

export async function generateMetadata({ params }: HomeProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isValidLang(lang)) return {};

  const locale = slugToDirectusLocale(lang);
  const page = await fetchPage("home", locale);
  const translation = page?.translations?.[0];
  const seo = extractItemSEO(translation?.seo);
  const resolved = resolveSEOFieldMappings(seo);

  const SITE_URL = getSiteUrl();
  const otherLang = lang === "de" ? "fr" : "de";
  const heroBlock = findBlock(page?.blocks || [], "block_hero");

  return buildMetadata({
    title: normalizeTitle(
      resolved?.title || "Installation de bornes de recharge en Suisse",
    ),
    description: truncate(
      resolved?.description ||
        "Trouvez rapidement un installateur certifié pour votre borne de recharge électrique en Suisse.",
    ),
    canonical: `${SITE_URL}/${lang}`,
    ogImage: resolveOgImage(resolved, undefined, heroBlock?.image),
    ogType: "website",
    robots: resolved?.noIndex ? "noindex, nofollow" : undefined,
    lang,
    alternates: buildAlternates({
      [lang]: `/${lang}`,
      [otherLang]: `/${otherLang}`,
    }),
  });
}

export default async function Home({ params }: HomeProps) {
  const { lang } = await params;
  if (!isValidLang(lang)) notFound();

  const locale = slugToDirectusLocale(lang);
  const [page, layoutData, pageRegistry] = await Promise.all([
    fetchPage("home", locale),
    fetchLayout(locale),
    fetchPageRegistry(),
  ]);

  const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
  const pageDict = page ? extractPageDictionary("home", page, locale) : {};
  const dictionary = { ...layoutDict, ...pageDict };
  const blocks = page?.blocks || [];

  const heroBlock = findBlock(blocks, "block_hero");
  const miniQuoteBlock = findBlock(blocks, "block_miniquote");
  const faqBlock = findBlock(blocks, "block_faq");
  const getQuoteBlock = findBlock(blocks, "block_getquote");

  // Global config
  const gc = layoutData?.global_config || {};
  const stats = gc?.stats || {};
  const trustpilot = gc?.trustpilot || {};
  const slas = gc?.slas || {};

  // Pre-interpolate global config SLA values into dictionary strings
  const slaEntries: [string, string][] = [
    ["quote_request_duration", String(slas?.quote_request_duration?.value ?? 3)],
    ["first_contact", String(slas?.first_contact?.value ?? 48)],
    ["quote_delivery_timeline", String(slas?.quote_delivery_timeline?.value ?? "3-5")],
  ];
  for (const key of Object.keys(dictionary)) {
    for (const [varName, varVal] of slaEntries) {
      if (dictionary[key].includes(`{${varName}}`)) {
        dictionary[key] = dictionary[key].replace(new RegExp(`\\{${varName}\\}`, "g"), varVal);
      }
    }
  }

  // Hero data
  const heroTranslation = heroBlock?.translations?.[0];
  const heroTitle = heroTranslation?.headline || t(dictionary, "pages.home.blocks.hero.title");
  const slaVars = {
    quote_request_duration: slas?.quote_request_duration?.value ?? 3,
    first_contact: slas?.first_contact?.value ?? 48,
    quote_delivery_timeline: slas?.quote_delivery_timeline?.value ?? "3-5",
  };
  const heroSubtitleRaw = heroTranslation?.subheadline || t(dictionary, "pages.home.blocks.hero.subtitle");
  const heroSubtitle = Object.entries(slaVars).reduce(
    (str, [k, v]) => str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    heroSubtitleRaw,
  );
  const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;
  // Hero checks: read from block translation content (not block root content)
  const heroTranslationChecks = heroTranslation?.content?.checks;
  const heroChecksConfig = heroTranslationChecks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? heroTranslationChecks.map((_: any, i: number) => String(i))
    : undefined;
  const heroChecksMap: Record<string, string> = {};
  if (heroTranslationChecks) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    heroTranslationChecks.forEach((_: any, i: number) => {
      const val = t(dictionary, `pages.home.blocks.hero.checks.${i}`);
      if (val !== `pages.home.blocks.hero.checks.${i}` && !val.startsWith("[")) {
        heroChecksMap[String(i)] = val;
      }
    });
  }
  const heroRatingTemplate = t(dictionary, "pages.home.blocks.hero.rating");
  const heroRating = stats.installations && trustpilot.score
    ? heroRatingTemplate.startsWith("[")
      ? `${stats.installations}+ installations · ${trustpilot.score}/5 Trustpilot`
      : heroRatingTemplate.replace("{installations}", String(stats.installations)).replace("{score}", String(trustpilot.score))
    : undefined;

  // Features and ProcessSteps use tPrefix + dictionary internally — no pre-resolution needed

  // FAQ items
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

  // Testimonials — build config from block settings, text resolved by component via dictionary
  const testimonialsBlock = findBlock(blocks, "block_testimonials");
  const testimonialsConfig = testimonialsBlock?.config || {};
  const testimonialRatings = testimonialsConfig?.testimonialsSection?.ratings || {};
  // Build itemsConfig: use ratings keys from CMS config, or fall back to defaults
  const testimonialItemIds = Object.keys(testimonialRatings).length > 0
    ? Object.keys(testimonialRatings)
    : ["item1", "item2", "item3", "item4", "item5", "item6", "item7", "item8"];
  const testimonialItems = testimonialItemIds
    .filter((id) => {
      // Only include items that have translations in the dictionary
      const name = t(dictionary, `pages.home.blocks.testimonials.items.${id}.name`);
      return !name.startsWith("[");
    })
    .map((id) => ({
      id,
      rating: typeof testimonialRatings[id] === "number" ? testimonialRatings[id] : 5,
    }));

  // Guide carousel (blog posts from postgroup block)
  const postGroupBlock = findBlock(blocks, "block_postgroup");
  const postGroupTranslation = postGroupBlock?.translations?.[0];
  const blogEntry = pageRegistry.find((p) => p.id === "blog");
  const blogSlug = blogEntry?.slugs[lang] || "blog";

  const parseReadingTime = (v: unknown): number => {
    if (!v) return 5;
    if (typeof v === "number") return v;
    const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
    if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    return parseInt(String(v), 10) || 5;
  };

  const guideCarouselPosts = (postGroupBlock?.posts || [])
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

  // GetQuote CTA
  const quoteEntry = pageRegistry.find((p) => p.id === "quote");
  const quoteSlug = quoteEntry?.slugs[lang];
  const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;

  // JSON-LD
  const SITE_URL = getSiteUrl();
  const schemas: AnyRecord[] = [
    buildOrganization({ logoUrl: `${SITE_URL}/og-default.webp` }),
    buildWebSite(),
    buildBreadcrumbList([
      { name: t(dictionary, "common.home"), url: `${SITE_URL}/${lang}` },
    ]),
  ];
  if (faqItems.length) {
    schemas.push(
      buildFAQPage(faqItems.map((f) => ({ question: f.question, answer: f.answer.replace(/<[^>]+>/g, "") }))),
    );
  }
  const jsonLd = wrapInGraph(...schemas);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section id="hero">
        <Hero
          title={heroTitle}
          subtitle={heroSubtitle}
          checksConfig={heroChecksConfig}
          checks={heroChecksMap}
          rating={heroRating}
          image={heroImage}
          pageId="home"
        >
          <MiniQuoteForm
            miniQuoteContent={miniQuoteBlock ? { config: miniQuoteBlock.config } : undefined}
            pageId="home"
            dictionary={dictionary}
            pageRegistry={pageRegistry}
            lang={lang}
            tOptions={{
              quote_request_duration: slas?.quote_request_duration?.value ?? 3,
            }}
          />
        </Hero>
      </section>

      <section id="features">
        <Features
          title={t(dictionary, "pages.home.features.title")}
          subtitle={t(dictionary, "pages.home.features.subtitle")}
          tPrefix="pages.home"
          image={findBlock(blocks, "block_features")?.image ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_features").image}` : undefined}
          dictionary={dictionary}
        />
      </section>

      <section id="process">
        <ProcessSteps
          title={t(dictionary, "pages.home.process.title")}
          subtitle={t(dictionary, "pages.home.process.subtitle")}
          tPrefix="pages.home"
          image={findBlock(blocks, "block_process")?.image ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_process").image}` : undefined}
          tOptions={{
            first_contact: slas?.first_contact?.value ?? 48,
            quote_delivery_timeline: slas?.quote_delivery_timeline?.value ?? "3-5",
            quote_request_duration: slas?.quote_request_duration?.value ?? 3,
          }}
          dictionary={dictionary}
        />
      </section>

      <section id="recharging-guide">
        {guideCarouselPosts.length > 0 && (
          <GuideCarousel
            title={postGroupTranslation?.headline}
            subtitle={postGroupTranslation?.subheadline}
            ctaLabel={postGroupTranslation?.ctas?.[0]?.label}
            ctaHref={`/${lang}/${blogSlug}`}
            posts={guideCarouselPosts}
            image={findBlock(blocks, "block_postgroup")?.image ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_postgroup").image}` : undefined}
            dictionary={dictionary}
            pageRegistry={pageRegistry}
          />
        )}
      </section>

      <section id="location">
        <SwissMap
          title={t(dictionary, "pages.home.location.title")}
          subtitle={t(dictionary, "pages.home.location.subtitle")}
          activeCantons={page?.config?.location?.activeCantons || ["GE", "VD", "FR", "VS"]}
          statsConfig={[
            { id: "cantonsCovered", icon: "Pin", value: stats.cantons ?? 4 },
            { id: "certifiedInstallers", icon: "CheckCircle", value: stats.partners ?? 1 },
            { id: "installationsDone", icon: "Zap", value: stats.installations ?? 550 },
          ]}
          tPrefix="pages.home"
          dictionary={dictionary}
        />
      </section>

      <section id="faq">
        {faqItems.length > 0 && (() => {
          const faqBlockData = findBlock(blocks, "block_faq");
          const faqTranslation = faqBlockData?.translations?.[0];
          const faqCta = faqTranslation?.ctas?.[0];
          const faqCtaHref = faqCta?.page_route_id
            ? resolveRouteId(faqCta.page_route_id, lang, pageRegistry) || `/${lang}`
            : undefined;
          return (
            <FAQ
              title={faqTranslation?.headline || t(dictionary, "pages.home.blocks.faq.title")}
              subtitle={faqTranslation?.subheadline || undefined}
              items={faqItems}
              image={faqBlockData?.image ? `${DIRECTUS_URL}/assets/${faqBlockData.image}` : undefined}
              ctaLabel={faqCta?.label}
              ctaHref={faqCtaHref}
              ctaVariant={faqCta?.variant}
              lang={lang}
              pageRegistry={pageRegistry}
            />
          );
        })()}
      </section>

      <section id="testimonials">
        {testimonialItems.length > 0 && (
          <Testimonials
            headline={t(dictionary, "pages.home.blocks.testimonials.title")}
            subheadline={t(dictionary, "pages.home.blocks.testimonials.subtitle")}
            itemsConfig={testimonialItems.map((ti) => ({ id: ti.id, rating: ti.rating }))}
            pageId="home"
            image={findBlock(blocks, "block_testimonials")?.image ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_testimonials").image}` : undefined}
            dictionary={dictionary}
          />
        )}
      </section>

      <GetQuote
        title={t(dictionary, "pages.home.blocks.getquote.headline")}
        subtitle={t(dictionary, "pages.home.blocks.getquote.subheadline")}
        ctaLabel={t(dictionary, "pages.home.blocks.getquote.cta.label")}
        ctaHref={ctaHref}
        note={t(dictionary, "pages.home.blocks.getquote.note")}
        image={getQuoteBlock?.image ? `${DIRECTUS_URL}/assets/${getQuoteBlock.image}` : undefined}
      />
    </>
  );
}
