import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchLayout, fetchPageRegistry } from "@/lib/directus-queries";
import { extractPageDictionary, t } from "@/lib/i18n/dictionaries";
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
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { ProcessSteps } from "@/components/ProcessSteps";
import { FAQ } from "@/components/FAQ";
import { GetQuote } from "@/components/GetQuote";
import { Testimonials } from "@/components/Testimonials";
import { GuideCarousel } from "@/components/GuideCarousel";
import { SwissMap } from "@/components/SwissMap";

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

  const dictionary = page ? extractPageDictionary("home", page, locale) : {};
  const blocks = page?.blocks || [];

  const heroBlock = findBlock(blocks, "block_hero");
  const faqBlock = findBlock(blocks, "block_faq");
  const getQuoteBlock = findBlock(blocks, "block_getquote");

  // Global config
  const gc = layoutData?.global_config || {};
  const stats = gc?.stats || {};
  const trustpilot = gc?.trustpilot || {};
  const slas = gc?.slas || {};

  // Hero data
  const heroTranslation = heroBlock?.translations?.[0];
  const heroTitle = heroTranslation?.headline || t(dictionary, "pages.home.blocks.hero.title");
  const heroSubtitle = heroTranslation?.subheadline || t(dictionary, "pages.home.blocks.hero.subtitle", {
    quote_request_duration: slas?.quote_request_duration?.value ?? 3,
  });
  const heroImage = heroBlock?.image ? `${DIRECTUS_URL}/assets/${heroBlock.image}` : undefined;
  const heroChecks = heroBlock?.content?.checks
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      heroBlock.content.checks.map((_: any, i: number) =>
        t(dictionary, `pages.home.blocks.hero.checks.${i}`),
      ).filter((c: string) => !c.startsWith("["))
    : undefined;
  const heroRating = stats.installations && trustpilot.score
    ? `${stats.installations}+ installations · ${trustpilot.score}/5 Trustpilot`
    : undefined;

  // Features
  const defaultFeatures = [
    { id: "certifiedInstallers", icon: "Shield" },
    { id: "transparentPrices", icon: "DollarSign" },
    { id: "expertAdvice", icon: "Users" },
    { id: "nationalCoverage", icon: "MapPin" },
    { id: "fastInstallation", icon: "Clock" },
    { id: "qualityGuarantee", icon: "Award" },
  ];
  const featureItems = defaultFeatures.map((f) => ({
    ...f,
    title: t(dictionary, `pages.home.features.items.${f.id}.title`),
    description: t(dictionary, `pages.home.features.items.${f.id}.description`),
  })).filter((f) => !f.title.startsWith("["));

  // Process steps
  const defaultSteps = [
    { id: "request", icon: "FileText", number: 1 },
    { id: "contact", icon: "Phone", number: 2 },
    { id: "decision", icon: "CheckCircle", number: 3 },
    { id: "installation", icon: "Wrench", number: 4 },
  ];
  const processSteps = defaultSteps.map((s) => ({
    ...s,
    title: t(dictionary, `pages.home.process.steps.${s.id}.title`),
    description: t(dictionary, `pages.home.process.steps.${s.id}.description`, {
      first_contact: slas?.first_contact?.value ?? 48,
      quote_delivery_timeline: slas?.quote_delivery_timeline?.value ?? "3-5",
      quote_request_duration: slas?.quote_request_duration?.value ?? 3,
    }),
  })).filter((s) => !s.title.startsWith("["));

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

  // Testimonials
  const testimonialsBlock = findBlock(blocks, "block_testimonials");
  const testimonialsTranslation = testimonialsBlock?.translations?.[0];
  const testimonialsConfig = testimonialsBlock?.config || {};
  const defaultTestimonialIds = ["item1", "item2", "item3", "item4", "item5"];
  const testimonialRatings = testimonialsConfig?.testimonialsSection?.ratings || {};
  const testimonialItems = defaultTestimonialIds
    .map((id) => {
      const name = t(dictionary, `pages.home.blocks.testimonials.items.${id}.name`);
      const text = t(dictionary, `pages.home.blocks.testimonials.items.${id}.text`);
      if (name.startsWith("[") || text.startsWith("[")) return null;
      return {
        id,
        name,
        text,
        status: t(dictionary, `pages.home.blocks.testimonials.items.${id}.status`),
        location: t(dictionary, `pages.home.blocks.testimonials.items.${id}.location`),
        rating: typeof testimonialRatings[id] === "number" ? testimonialRatings[id] : 5,
      };
    })
    .filter(Boolean) as Array<{ id: string; name: string; text: string; status?: string; location?: string; rating: number }>;

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
  const getQuoteTranslation = getQuoteBlock?.translations?.[0];
  const quoteEntry = pageRegistry.find((p) => p.id === "quote");
  const quoteSlug = quoteEntry?.slugs[lang];
  const ctaHref = quoteSlug ? `/${lang}/${quoteSlug}` : `/${lang}`;
  const ctaLabel = getQuoteTranslation?.ctas?.[0]?.label ||
    t(dictionary, "pages.home.blocks.get-quote.cta.label") ||
    (lang === "de" ? "Offerte anfragen" : "Demander un devis");

  // JSON-LD
  const SITE_URL = getSiteUrl();
  const schemas: AnyRecord[] = [
    buildOrganization({ logoUrl: `${SITE_URL}/og-default.webp` }),
    buildWebSite(),
    buildBreadcrumbList([
      { name: lang === "de" ? "Startseite" : "Accueil", url: `${SITE_URL}/${lang}` },
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

      <Hero
        title={heroTitle}
        subtitle={heroSubtitle}
        checks={heroChecks}
        rating={heroRating}
        image={heroImage}
      />

      {featureItems.length > 0 && (
        <Features
          title={t(dictionary, "pages.home.features.title")}
          subtitle={t(dictionary, "pages.home.features.subtitle")}
          items={featureItems}
        />
      )}

      {processSteps.length > 0 && (
        <ProcessSteps
          title={t(dictionary, "pages.home.process.title")}
          subtitle={t(dictionary, "pages.home.process.subtitle")}
          steps={processSteps}
        />
      )}

      <SwissMap
        title={t(dictionary, "pages.home.location.title")}
        subtitle={t(dictionary, "pages.home.location.subtitle")}
        activeCantons={page?.config?.location?.activeCantons || ["GE", "VD", "FR", "VS"]}
        stats={[
          { id: "cantonsCovered", icon: "Pin", value: stats.cantons ?? 4, label: t(dictionary, "pages.home.location.stats.cantonsCovered") },
          { id: "certifiedInstallers", icon: "CheckCircle", value: stats.partners ?? 1, label: t(dictionary, "pages.home.location.stats.certifiedInstallers") },
          { id: "installationsDone", icon: "Zap", value: stats.installations ?? 550, label: t(dictionary, "pages.home.location.stats.installationsDone") },
        ]}
      />

      {guideCarouselPosts.length > 0 && (
        <GuideCarousel
          title={postGroupTranslation?.headline || t(dictionary, "pages.home.blocks.postgroup.title")}
          subtitle={postGroupTranslation?.subheadline || t(dictionary, "pages.home.blocks.postgroup.subtitle")}
          ctaLabel={postGroupTranslation?.ctas?.[0]?.label || (lang === "de" ? "Alle Artikel" : "Tous les articles")}
          ctaHref={`/${lang}/${blogSlug}`}
          posts={guideCarouselPosts}
          lang={lang}
          blogSlug={blogSlug}
        />
      )}

      {faqItems.length > 0 && (
        <FAQ
          title={t(dictionary, "pages.home.blocks.faq.title")}
          items={faqItems}
        />
      )}

      {testimonialItems.length > 0 && (
        <Testimonials
          headline={t(dictionary, "pages.home.blocks.testimonials.title")}
          subheadline={t(dictionary, "pages.home.blocks.testimonials.subtitle")}
          items={testimonialItems}
        />
      )}

      <GetQuote
        title={getQuoteTranslation?.headline || t(dictionary, "pages.home.blocks.get-quote.title")}
        subtitle={getQuoteTranslation?.subheadline || t(dictionary, "pages.home.blocks.get-quote.subtitle")}
        ctaLabel={ctaLabel}
        ctaHref={ctaHref}
      />
    </>
  );
}
