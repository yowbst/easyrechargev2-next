import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchLayout } from "@/lib/directus-queries";
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
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

interface HomeProps {
  params: Promise<{ lang: string }>;
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
  const heroBlock = page?.blocks?.find(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (b: any) => b?.collection === "block_hero",
  );
  const heroImage = heroBlock?.item?.image;

  return buildMetadata({
    title: normalizeTitle(
      resolved?.title || "Installation de bornes de recharge en Suisse",
    ),
    description: truncate(
      resolved?.description ||
        "Trouvez rapidement un installateur certifié pour votre borne de recharge électrique en Suisse.",
    ),
    canonical: `${SITE_URL}/${lang}`,
    ogImage: resolveOgImage(resolved, undefined, heroImage),
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
  const [page, layoutData] = await Promise.all([
    fetchPage("home", locale),
    fetchLayout(locale),
  ]);

  const dictionary = page
    ? extractPageDictionary("home", page, locale)
    : {};

  // Extract blocks for rendering
  const blocks = page?.blocks || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findBlock = (collection: string) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blocks.find((b: any) => b?.collection === collection)?.item;

  const heroBlock = findBlock("block_hero");
  const faqBlock = findBlock("block_faq");

  // JSON-LD
  const SITE_URL = getSiteUrl();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schemas: Record<string, unknown>[] = [
    buildOrganization({ logoUrl: `${SITE_URL}/og-default.webp` }),
    buildWebSite(),
    buildBreadcrumbList([
      { name: lang === "de" ? "Startseite" : "Accueil", url: `${SITE_URL}/${lang}` },
    ]),
  ];

  // FAQ JSON-LD
  if (faqBlock?.faq_items?.length) {
    const faqItems = faqBlock.faq_items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((junction: any) => {
        const item = junction?.faq_items_id;
        if (!item?.translations) return null;
        const trans =
          item.translations.find(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (tr: any) => tr.languages_code === locale,
          ) || item.translations[0];
        if (!trans?.question || !trans?.answer) return null;
        return {
          question: trans.question,
          answer: trans.answer.replace(/<[^>]+>/g, ""),
        };
      })
      .filter(Boolean) as Array<{ question: string; answer: string }>;
    if (faqItems.length) schemas.push(buildFAQPage(faqItems));
  }

  const jsonLd = wrapInGraph(...schemas);

  // Hero translation
  const heroTranslation = heroBlock?.translations?.[0];
  const heroTitle = heroTranslation?.headline || dictionary["pages.home.blocks.hero.title"] || "";
  const heroSubtitle = heroTranslation?.subheadline || dictionary["pages.home.blocks.hero.subtitle"] || "";
  const heroImage = heroBlock?.image
    ? `${DIRECTUS_URL}/assets/${heroBlock.image}`
    : undefined;

  // Global config
  const gc = layoutData?.global_config || {};
  const stats = gc?.stats || {};
  const trustpilot = gc?.trustpilot || {};

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-primary/5 to-background py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
              {heroTitle}
            </h1>
            {heroSubtitle && (
              <p className="text-lg md:text-xl text-muted-foreground">
                {heroSubtitle}
              </p>
            )}
            {stats.installations && trustpilot.score && (
              <p className="text-sm text-muted-foreground">
                {stats.installations}+ installations · {trustpilot.score}/5 Trustpilot
              </p>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      {faqBlock?.faq_items?.length > 0 && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-heading text-3xl font-bold text-center mb-8">
              {dictionary["pages.home.blocks.faq.title"] || "FAQ"}
            </h2>
            <div className="space-y-4">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {faqBlock.faq_items.map((junction: any) => {
                const item = junction?.faq_items_id;
                if (!item?.translations) return null;
                const trans =
                  item.translations.find(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (tr: any) => tr.languages_code === locale,
                  ) || item.translations[0];
                if (!trans?.question) return null;
                return (
                  <details
                    key={item.id}
                    className="border rounded-lg p-4 bg-background"
                  >
                    <summary className="font-medium cursor-pointer">
                      {trans.question}
                    </summary>
                    {trans.answer && (
                      <div
                        className="mt-3 text-muted-foreground prose prose-sm dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: trans.answer }}
                      />
                    )}
                  </details>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
