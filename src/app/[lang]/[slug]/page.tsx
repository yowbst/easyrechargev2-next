import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchPage, fetchPageRegistry } from "@/lib/directus-queries";
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
import { extractPageDictionary } from "@/lib/i18n/dictionaries";
import { QuoteForm } from "@/components/quote/QuoteForm";
import { ContactForm } from "@/components/ContactForm";

interface SlugPageProps {
  params: Promise<{ lang: string; slug: string }>;
}

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
  const page = await fetchPage(entry.id, locale);
  if (!page) notFound();

  // Interactive pages: render dedicated form components
  if (INTERACTIVE_PAGES.has(entry.id)) {
    const dictionary = extractPageDictionary(entry.id, page, locale);

    if (entry.id === "quote") {
      return <QuoteForm lang={lang} dictionary={dictionary} />;
    }
    if (entry.id === "contact") {
      return <ContactForm lang={lang} dictionary={dictionary} />;
    }
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
        name: lang === "de" ? "Startseite" : "Accueil",
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
            {lang === "de" ? "Letzte Aktualisierung: " : "Dernière mise à jour: "}
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
                    dangerouslySetInnerHTML={{ __html: section.content }}
                  />
                )}
              </section>
            ))
          ) : body ? (
            <div
              className="prose-headings:font-heading prose-headings:tracking-tight prose-headings:text-foreground prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-a:font-medium hover:prose-a:underline prose-strong:text-foreground"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : (
            <p className="text-muted-foreground">
              {lang === "de" ? "Kein Inhalt verfügbar." : "Aucun contenu disponible."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
