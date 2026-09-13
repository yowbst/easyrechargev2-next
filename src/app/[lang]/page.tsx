import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchLayout, fetchPageRegistry, fetchCantonCoats } from "@/lib/directus-queries";
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

import { MiniQuoteForm } from "@/components/MiniQuoteForm";

// Direction B — home-only components. The shared Hero/Features/ProcessSteps/
// Testimonials/GetQuote are still used by [slug] templates and the vehicle,
// blog and contact pages, so this page gets its own set rather than restyling
// theirs out from under them.
import { HeroB, type HeroStat } from "@/components/home-b/HeroB";
import { ProductShowcase, type Callout } from "@/components/home-b/ProductShowcase";
import { PowerOptions, type PowerOption } from "@/components/home-b/PowerOptions";
import { ProofGrid, type ProofItem } from "@/components/home-b/ProofGrid";
import { ProcessB, type ProcessStepB } from "@/components/home-b/ProcessB";
import { PartnerNetwork, type PartnerCard } from "@/components/home-b/PartnerNetwork";
import { CoproBlock } from "@/components/home-b/CoproBlock";
import { TestimonialsB, type TestimonialB } from "@/components/home-b/TestimonialsB";
import { CtaB } from "@/components/home-b/CtaB";
import { GuidesB, type GuidePost } from "@/components/home-b/GuidesB";
import { CoverageB, type CoverageStat } from "@/components/home-b/CoverageB";
import { FaqB, type FaqEntry } from "@/components/home-b/FaqB";
import { opt, optList } from "@/components/home-b/content";

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
  const [page, layoutData, pageRegistry, cantonCoats] = await Promise.all([
    fetchPage("home", locale),
    fetchLayout(locale),
    fetchPageRegistry(),
    fetchCantonCoats(),
  ]);

  const layoutDict = layoutData ? extractLayoutDictionary(layoutData) : {};
  const pageDict = page ? extractPageDictionary("home", page, locale) : {};
  const dictionary = { ...layoutDict, ...pageDict };
  const blocks = page?.blocks || [];

  const heroBlock = findBlock(blocks, "block_hero");
  const miniQuoteBlock = findBlock(blocks, "block_miniquote");
  const faqBlock = findBlock(blocks, "block_faq");

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
  // Secondary CTA ("parler à un conseiller") points at the contact page when
  // the registry has one; without it the button simply isn't rendered.
  const contactEntry = pageRegistry.find((p) => p.id === "contact");
  const contactHref = contactEntry?.slugs[lang]
    ? `/${lang}/${contactEntry.slugs[lang]}`
    : undefined;

  // ─── Direction B sections ───────────────────────────────────────────────
  // Hero figures come from global_config, which already holds the SLAs the
  // rest of the site quotes — so the hero can never disagree with the process
  // section about how long a first contact takes.
  const heroStats: HeroStat[] = [
    {
      value: String(slas?.first_contact?.value ?? 48),
      unit: "h",
      label: t(dictionary, "pages.home.blocks.hero.stats.first_contact"),
    },
    {
      value: String(slas?.quote_delivery_timeline?.value ?? "3-5"),
      unit: "j",
      label: t(dictionary, "pages.home.blocks.hero.stats.quote_delivery"),
    },
    {
      value: String(trustpilot.score ?? "4.8"),
      unit: "/5",
      label: t(dictionary, "pages.home.blocks.hero.stats.rating"),
    },
  ].filter((stat) => !stat.label.startsWith("[") && !stat.label.startsWith("pages."));

  // Proof cards reuse the Features block's own keys — same copy, new form.
  const featuresBlock = findBlock(blocks, "block_features");
  const proofItems: ProofItem[] = (
    featuresBlock?.config?.items ?? [
      { id: "certifiedInstallers", icon: "ShieldCheck" },
      { id: "transparentPrices", icon: "Landmark" },
      { id: "expertAdvice", icon: "Users" },
      { id: "nationalCoverage", icon: "MapPin" },
      { id: "fastInstallation", icon: "Timer" },
      { id: "qualityGuarantee", icon: "Award" },
    ]
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => {
      const title = opt(dictionary, `pages.home.features.items.${item.id}.title`);
      const body = opt(dictionary, `pages.home.features.items.${item.id}.description`);
      return title ? { id: item.id, icon: item.icon, title, body: body ?? "" } : null;
    })
    .filter(Boolean) as ProofItem[];

  // Process steps likewise reuse the existing block's keys; the SLA chips are
  // the global_config values the copy already interpolates.
  const processBlock = findBlock(blocks, "block_process");
  const stepSlas: Record<string, string | undefined> = {
    request: opt(dictionary, "pages.home.process.steps.request.sla"),
    contact: opt(dictionary, "pages.home.process.steps.contact.sla"),
    decision: opt(dictionary, "pages.home.process.steps.decision.sla"),
    installation: opt(dictionary, "pages.home.process.steps.installation.sla"),
  };
  const processSteps: ProcessStepB[] = (
    processBlock?.config?.steps ?? [
      { id: "request" },
      { id: "contact" },
      { id: "decision" },
      { id: "installation" },
    ]
  )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((step: any, i: number) => {
      const title = opt(dictionary, `pages.home.process.steps.${step.id}.title`);
      const body = opt(dictionary, `pages.home.process.steps.${step.id}.description`);
      return title
        ? {
            id: step.id,
            n: String(i + 1).padStart(2, "0"),
            sla: stepSlas[step.id],
            title,
            body: body ?? "",
          }
        : null;
    })
    .filter(Boolean) as ProcessStepB[];

  const testimonialsB: TestimonialB[] = testimonialItems
    .map((ti) => {
      const tbp = "pages.home.blocks.testimonials";
      const text = opt(dictionary, `${tbp}.items.${ti.id}.text`);
      const name = opt(dictionary, `${tbp}.items.${ti.id}.name`);
      if (!text || !name) return null;
      const status = opt(dictionary, `${tbp}.items.${ti.id}.status`);
      const location = opt(dictionary, `${tbp}.items.${ti.id}.location`);
      return {
        id: ti.id,
        text,
        name,
        meta: [status, location].filter(Boolean).join(" · ") || undefined,
        rating: ti.rating,
      };
    })
    .filter(Boolean) as TestimonialB[];

  // The four sections the design adds have no Directus block yet. Each is
  // built from optional keys and renders only once its content exists — so
  // the page ships complete in both languages today and fills in later,
  // rather than shipping French placeholder copy to German visitors.
  const productCallouts = optList<Callout>(
    dictionary,
    "pages.home.blocks.product.items",
    (at, i) => {
      const title = at("title");
      return title
        ? { n: String(i + 1), title, body: at("body") ?? "" }
        : null;
    },
    3,
  );
  const productTitle = opt(dictionary, "pages.home.blocks.product.title");

  const powerOptions = optList<PowerOption>(
    dictionary,
    "pages.home.blocks.power.items",
    (at, i) => {
      const kw = at("kw");
      const title = at("title");
      if (!kw || !title) return null;
      return {
        id: `power-${i}`,
        kw,
        tag: at("tag"),
        recommended: at("recommended") === "true",
        title,
        body: at("body") ?? "",
        time: at("time"),
      };
    },
    3,
  );
  const powerTitle = opt(dictionary, "pages.home.blocks.power.title");

  const networkPartners = optList<PartnerCard>(
    dictionary,
    "pages.home.blocks.network.items",
    (at, i) => {
      const name = at("name");
      return name
        ? { id: `partner-${i}`, name, canton: at("canton") ?? "", meta: at("meta") }
        : null;
    },
  );
  const networkTitle = opt(dictionary, "pages.home.blocks.network.title");

  const coproPoints = optList<{ text: string }>(
    dictionary,
    "pages.home.blocks.copro.points",
    (at) => {
      const text = at("");
      return text ? { text } : null;
    },
    6,
  ).map((p) => p.text);
  const coproTitle = opt(dictionary, "pages.home.blocks.copro.title");

  // Guides, coverage and FAQ keep their existing Directus sources; only the
  // rendering moves to Direction B.
  const guidePosts: GuidePost[] = guideCarouselPosts.map((post) => ({
    id: post.id,
    title: post.title,
    excerpt: post.excerpt,
    readingTime: post.readingTime,
    image: post.image,
    category: post.category,
    tag: post.tag,
    href: `/${lang}/${blogSlug}/${post.categorySlug}/${post.slug}`,
  }));

  const coverageStats: CoverageStat[] = [
    { id: "cantonsCovered", icon: "Pin", value: stats.cantons ?? 4 },
    { id: "certifiedInstallers", icon: "CheckCircle", value: stats.partners ?? 1 },
    { id: "installationsDone", icon: "Zap", value: stats.installations ?? 550 },
  ].map((stat) => ({
    ...stat,
    label: t(dictionary, `pages.home.location.stats.${stat.id}`),
  }));

  const faqEntries: FaqEntry[] = faqItems.map((item) => ({
    id: item.id,
    question: item.question,
    answer: item.answer,
  }));

  const faqBlockData = findBlock(blocks, "block_faq");
  const faqTranslation = faqBlockData?.translations?.[0];
  const faqCta = faqTranslation?.ctas?.[0];
  const faqCtaHref = faqCta?.page_route_id
    ? resolveRouteId(faqCta.page_route_id, lang, pageRegistry) || `/${lang}`
    : undefined;

  const networkEntry = pageRegistry.find((p) => p.id === "partners-network");
  const networkHref = networkEntry?.slugs[lang]
    ? `/${lang}/${networkEntry.slugs[lang]}`
    : undefined;

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
    <div data-direction-b>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section id="hero">
        <HeroB
          badgeValue={stats.installations ? String(stats.installations) : undefined}
          badgeLabel={opt(dictionary, "pages.home.blocks.hero.badge")}
          title={heroTitle}
          subtitle={heroSubtitle}
          stats={heroStats}
        >
          <div className="mb-5 flex items-center justify-between gap-4">
            <span className="text-[17px] font-semibold">
              {opt(dictionary, "pages.home.blocks.mini-quote.title") ??
                t(dictionary, "pages.home.blocks.mini-quote.form.submit.text")}
            </span>
          </div>
          <MiniQuoteForm
            variant="surface"
            miniQuoteContent={miniQuoteBlock ? { config: miniQuoteBlock.config } : undefined}
            pageId="home"
            dictionary={dictionary}
            pageRegistry={pageRegistry}
            lang={lang}
            tOptions={{
              quote_request_duration: slas?.quote_request_duration?.value ?? 3,
            }}
          />
          {opt(dictionary, "pages.home.blocks.mini-quote.reassurance") && (
            <p className="mt-3.5 text-center text-sm leading-[1.6] text-muted-foreground">
              {opt(dictionary, "pages.home.blocks.mini-quote.reassurance")}
            </p>
          )}
        </HeroB>
      </section>

      {/* The borne in context. Renders once its Directus copy exists. */}
      {productTitle && (
        <section id="product">
          <ProductShowcase
            eyebrow={opt(dictionary, "pages.home.blocks.product.eyebrow")}
            title={productTitle}
            lede={opt(dictionary, "pages.home.blocks.product.lede")}
            action={
              opt(dictionary, "pages.home.blocks.product.cta.label")
                ? {
                    label: opt(dictionary, "pages.home.blocks.product.cta.label")!,
                    href: ctaHref,
                  }
                : undefined
            }
            image={
              findBlock(blocks, "block_product")?.image
                ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_product").image}`
                : undefined
            }
            imageAlt={opt(dictionary, "pages.home.blocks.product.image_alt") ?? ""}
            callouts={productCallouts}
            badge={opt(dictionary, "pages.home.blocks.product.badge")}
          />
        </section>
      )}

      {powerTitle && powerOptions.length > 0 && (
        <section id="power">
          <PowerOptions
            title={powerTitle}
            aside={opt(dictionary, "pages.home.blocks.power.aside")}
            options={powerOptions}
            note={opt(dictionary, "pages.home.blocks.power.note")}
          />
        </section>
      )}

      <section id="features">
        <ProofGrid
          eyebrow={opt(dictionary, "pages.home.features.eyebrow")}
          title={opt(dictionary, "pages.home.features.title")}
          items={proofItems}
        />
      </section>

      <section id="process">
        <ProcessB
          title={t(dictionary, "pages.home.process.title")}
          lede={opt(dictionary, "pages.home.process.subtitle")}
          steps={processSteps}
        />
      </section>

      {networkTitle && networkPartners.length > 0 && (
        <section id="network">
          <PartnerNetwork
            title={networkTitle}
            certifiedLabel={opt(dictionary, "pages.home.blocks.network.certified")}
            action={
              networkHref && opt(dictionary, "pages.home.blocks.network.cta.label")
                ? {
                    label: opt(dictionary, "pages.home.blocks.network.cta.label")!,
                    href: networkHref,
                  }
                : undefined
            }
            partners={networkPartners}
          />
        </section>
      )}

      {/* Coverage answers the same question as the network above it — "who
          actually comes to my place?" — so the two sit together, then hand
          over to the reviews. */}
      <section id="location">
        <CoverageB
          eyebrow={opt(dictionary, "pages.home.location.eyebrow")}
          title={t(dictionary, "pages.home.location.title")}
          lede={opt(dictionary, "pages.home.location.subtitle")}
          activeCantons={page?.config?.location?.activeCantons || ["GE", "VD", "FR", "VS"]}
          stats={coverageStats}
          cantonCoats={cantonCoats}
          legendActive={t(dictionary, "pages.home.location.legend.activeCantons")}
          legendInactive={t(dictionary, "pages.home.location.legend.inactiveCantons")}
          loadingLabel={t(dictionary, "common.loadingMap")}
        />
      </section>

      <section id="testimonials">
        <TestimonialsB
          eyebrow={opt(dictionary, "pages.home.blocks.testimonials.eyebrow")}
          title={t(dictionary, "pages.home.blocks.testimonials.title")}
          aside={
            trustpilot.score
              ? opt(dictionary, "pages.home.blocks.testimonials.rating", {
                  score: String(trustpilot.score),
                })
              : undefined
          }
          items={testimonialsB}
        />
      </section>

      {coproTitle && (
        <section id="copro">
          <CoproBlock
            eyebrow={opt(dictionary, "pages.home.blocks.copro.eyebrow")}
            title={coproTitle}
            lede={opt(dictionary, "pages.home.blocks.copro.lede")}
            points={coproPoints}
            action={
              opt(dictionary, "pages.home.blocks.copro.cta.label")
                ? {
                    label: opt(dictionary, "pages.home.blocks.copro.cta.label")!,
                    href: ctaHref,
                  }
                : undefined
            }
            image={
              findBlock(blocks, "block_copro")?.image
                ? `${DIRECTUS_URL}/assets/${findBlock(blocks, "block_copro").image}`
                : undefined
            }
            imageAlt={opt(dictionary, "pages.home.blocks.copro.image_alt") ?? ""}
            statValue={opt(dictionary, "pages.home.blocks.copro.stat.value")}
            statLabel={opt(dictionary, "pages.home.blocks.copro.stat.label")}
          />
        </section>
      )}

      <section id="recharging-guide">
        <GuidesB
          eyebrow={opt(dictionary, "pages.home.blocks.postgroup.eyebrow")}
          title={postGroupTranslation?.headline ?? t(dictionary, "pages.home.blocks.postgroup.title")}
          lede={postGroupTranslation?.subheadline ?? undefined}
          posts={guidePosts}
          action={
            postGroupTranslation?.ctas?.[0]?.label
              ? { label: postGroupTranslation.ctas[0].label, href: `/${lang}/${blogSlug}` }
              : undefined
          }
          readingTimeLabel={
            opt(dictionary, "pages.home.blocks.postgroup.reading_time") ?? "{n} min"
          }
          readLabel={opt(dictionary, "pages.home.blocks.postgroup.read")}
          prevLabel={t(dictionary, "common.previous")}
          nextLabel={t(dictionary, "common.next")}
        />
      </section>

      {/* Last before the CTA: objections are answered at the moment of
          deciding. This section also backs the page's FAQPage schema, so its
          answers must stay in the document — see FaqB. */}
      <section id="faq">
        <FaqB
          eyebrow={opt(dictionary, "pages.home.blocks.faq.eyebrow")}
          title={faqTranslation?.headline || t(dictionary, "pages.home.blocks.faq.title")}
          lede={faqTranslation?.subheadline || undefined}
          items={faqEntries}
          action={
            faqCta?.label && faqCtaHref
              ? { label: faqCta.label, href: faqCtaHref }
              : undefined
          }
        />
      </section>

      <CtaB
        title={t(dictionary, "pages.home.blocks.getquote.headline")}
        subtitle={opt(dictionary, "pages.home.blocks.getquote.subheadline")}
        primary={{
          label: t(dictionary, "pages.home.blocks.getquote.cta.label"),
          href: ctaHref,
        }}
        secondary={
          contactHref && opt(dictionary, "pages.home.blocks.getquote.cta.secondary")
            ? {
                label: opt(dictionary, "pages.home.blocks.getquote.cta.secondary")!,
                href: contactHref,
              }
            : undefined
        }
        note={opt(dictionary, "pages.home.blocks.getquote.note")}
      />
    </div>
  );
}
