import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { fetchBlogPost, fetchPageRegistry } from "@/lib/directus-queries";
import { isValidLang, slugToDirectusLocale } from "@/lib/i18n/config";
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
import { fetchPage } from "@/lib/directus-queries";
import { wrapInGraph, buildBlogPosting, buildBreadcrumbList } from "@/lib/seo/jsonLd";

interface BlogPostPageProps {
  params: Promise<{
    lang: string;
    blogSlug: string;
    categorySlug: string;
    postSlug: string;
  }>;
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { lang, blogSlug, categorySlug, postSlug } = await params;
  if (!isValidLang(lang)) return {};

  const locale = slugToDirectusLocale(lang);
  const [post, templatePage] = await Promise.all([
    fetchBlogPost(postSlug, locale),
    fetchPage("blog-post", locale),
  ]);

  if (!post) return {};

  const pt = post.translations?.[0];
  const ct = post.category?.translations?.[0];
  const articleTitle = pt?.title || postSlug;

  const templateSeo = extractItemSEO(
    templatePage?.translations?.[0]?.seo,
  );
  const itemSeo = extractItemSEO(pt?.seo);
  const merged = mergeItemOverTemplate(itemSeo, templateSeo);
  const resolved = resolveSEOFieldMappings(merged, {
    title: articleTitle,
    category: ct?.name || categorySlug,
    slug: postSlug,
  });

  const SITE_URL = getSiteUrl();
  const imageUrl = post.image ? resolveImageUrl(post.image) : undefined;
  const currentPath = `/${lang}/${blogSlug}/${categorySlug}/${postSlug}`;

  // Build alternates from post translations
  const langPaths: Record<string, string> = {};
  const registry = await fetchPageRegistry();
  const blogPage = registry.find((p) => p.id === "blog");

  for (const l of ["fr", "de"] as const) {
    const loc = slugToDirectusLocale(l);
    const postTrans = post.translations?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.languages_code === loc,
    );
    const catTrans = post.category?.translations?.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (t: any) => t.languages_code === loc,
    );
    if (postTrans?.slug && catTrans?.slug) {
      const blogPageSlug = blogPage?.slugs[l] || "blog";
      langPaths[l] = `/${l}/${blogPageSlug}/${catTrans.slug}/${postTrans.slug}`;
    }
  }

  return buildMetadata({
    title: normalizeTitle(resolved?.title || articleTitle),
    description: truncate(resolved?.description || articleTitle),
    canonical: `${SITE_URL}${currentPath}`,
    ogImage: resolveOgImage(resolved, imageUrl),
    ogType: "article",
    lang,
    alternates: buildAlternates(langPaths),
    articleMeta: {
      publishedTime: post.date_created,
      modifiedTime: post.date_updated,
      section: ct?.name || categorySlug,
    },
  });
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { lang, blogSlug, categorySlug, postSlug } = await params;
  if (!isValidLang(lang)) notFound();

  const locale = slugToDirectusLocale(lang);
  const post = await fetchBlogPost(postSlug, locale);
  if (!post) notFound();

  const pt = post.translations?.[0];
  const ct = post.category?.translations?.[0];

  if (!pt) notFound();

  const articleTitle = pt.title || "";
  const articleBody = pt.body || "";
  const articleImage = post.image
    ? `${DIRECTUS_URL}/assets/${post.image}`
    : null;
  const categoryName = ct?.name || categorySlug;
  const readingTime = (() => {
    const v = post.reading_time;
    if (!v) return undefined;
    if (typeof v === "number") return v;
    const match = String(v).match(/^(\d+):(\d+):(\d+)$/);
    if (match)
      return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
    return parseInt(String(v), 10) || undefined;
  })();

  // Takeaways
  const takeaways = pt.takeaways
    ? decodeHtmlEntities(
        (pt.takeaways as string).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      )
    : null;

  // JSON-LD
  const SITE_URL = getSiteUrl();
  const currentPath = `/${lang}/${blogSlug}/${categorySlug}/${postSlug}`;
  const ogImage = articleImage || `${SITE_URL}/og-default.webp`;

  const jsonLd = wrapInGraph(
    buildBlogPosting({
      headline: articleTitle,
      description: pt.excerpt || articleTitle,
      imageUrl: ogImage,
      datePublished: post.date_created || new Date().toISOString(),
      dateModified: post.date_updated,
      categoryName,
      url: `${SITE_URL}${currentPath}`,
      langCode: lang === "de" ? "de-CH" : "fr-CH",
    }),
    buildBreadcrumbList([
      {
        name: lang === "de" ? "Startseite" : "Accueil",
        url: `${SITE_URL}/${lang}`,
      },
      { name: "Blog", url: `${SITE_URL}/${lang}/${blogSlug}` },
      { name: categoryName, url: `${SITE_URL}/${lang}/${blogSlug}/${categorySlug}` },
      { name: articleTitle, url: `${SITE_URL}${currentPath}` },
    ]),
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="container mx-auto px-4 py-12 max-w-4xl">
        {/* Back link */}
        <Link
          href={`/${lang}/${blogSlug}`}
          className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block"
        >
          ← {lang === "de" ? "Zurück zum Blog" : "Retour au blog"}
        </Link>

        {/* Category + reading time */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
          <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs font-medium">
            {categoryName}
          </span>
          {readingTime && (
            <span>{readingTime} min {lang === "de" ? "Lesezeit" : "de lecture"}</span>
          )}
          {post.date_created && (
            <time dateTime={post.date_created}>
              {new Date(post.date_created).toLocaleDateString(
                lang === "de" ? "de-CH" : "fr-CH",
              )}
            </time>
          )}
        </div>

        {/* Title */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold mb-6 tracking-tight">
          {articleTitle}
        </h1>

        {/* Takeaways */}
        {takeaways && (
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            {takeaways}
          </p>
        )}

        {/* Featured image */}
        {articleImage && (
          <div className="relative w-full aspect-[16/9] mb-10 rounded-xl overflow-hidden">
            <Image
              src={articleImage}
              alt={articleTitle}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        {/* Article body */}
        <div
          className="prose prose-lg dark:prose-invert max-w-none prose-headings:font-heading prose-headings:tracking-tight prose-a:text-primary hover:prose-a:underline prose-img:rounded-lg"
          dangerouslySetInnerHTML={{ __html: articleBody }}
        />

        {/* Tags */}
        {post.tags?.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-10 pt-6 border-t">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {post.tags.map((tagJunction: any) => {
              const tag = tagJunction?.blog_tags_id;
              const tagName =
                tag?.translations?.[0]?.name || tag?.name;
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
    </>
  );
}
