"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import { BookOpen, List, ChevronDown } from "lucide-react";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { Container, Eyebrow, SectionTitle } from "@/components/home-b/Shell";
import { PostCard } from "@/components/home-b/PostCard";
import { CtaB } from "@/components/home-b/CtaB";
import { useVisibleTagSections } from "@/hooks/useVisibleTagSections";
import { t } from "@/lib/i18n/dictionaries";
import { opt } from "@/components/home-b/content";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface TransformedPost {
  id: string;
  title: string;
  excerpt: string;
  slug: string;
  readingTime: number;
  image: string;
  date: string;
  category: string;
  categorySlug: string;
  categoryId: string;
  featured?: boolean;
  tags: Array<{ id: string; name: string; slug: string }>;
}

interface GetQuoteBlockData {
  variant?: string;
  image?: string;
}

interface BlogListingProps {
  posts: TransformedPost[];
  heroTitle: string;
  heroSubtitle: string;
  heroImage?: string;
  guideSectionTitle?: string;
  guideSectionSubtitle?: string;
  getQuoteBlock?: GetQuoteBlockData;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  lang: string;
}

/**
 * The mini-quote card is shared with five other pages; on the blog it sits in
 * the article grid and must not read as one more article (design 11 Blog), so
 * it is re-coloured Forest here by scoping the theme variables it already uses.
 */
const FOREST_SCOPE =
  "[--card:#07231a] [--card-foreground:#f3f1eb] [--foreground:#f3f1eb] [--muted-foreground:rgba(243,241,235,.78)] [--border:rgba(243,241,235,.22)] [--primary:#16a34a] [--primary-foreground:#04150c] [--muted:rgba(243,241,235,.08)] [--accent:rgba(243,241,235,.08)] [--accent-foreground:#f3f1eb] [--input:rgba(243,241,235,.22)]";

const chipClass = (on: boolean) =>
  `inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-md border px-4 text-[15px] transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring ${
    on
      ? "border-b-forest bg-b-forest font-semibold text-b-on-forest"
      : "border-border bg-card font-medium text-foreground hover:bg-b-inset"
  }`;

export function BlogListing({
  posts,
  heroTitle,
  heroSubtitle,
  heroImage,
  guideSectionTitle,
  guideSectionSubtitle,
  dictionary,
  pageRegistry,
  lang,
}: BlogListingProps) {
  const hasImage = !!heroImage;
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  const blogSlug = pageRegistry.find((p) => p.id === "blog")?.slugs[lang] || "blog";
  const postHref = (post: TransformedPost) => `/${lang}/${blogSlug}/${post.categorySlug}/${post.slug}`;
  const card = (post: TransformedPost, readLabel: string | undefined, priority: boolean, tag?: string) => (
    <PostCard
      key={post.id}
      post={{ ...post, tag, href: postHref(post) }}
      readingTimeLabel={d("shared.blogCard.readingTime.label", { count: post.readingTime })}
      readLabel={readLabel}
      priority={priority}
      testId={`card-blog-${post.id}`}
    />
  );
  const guideRead = opt(dictionary, "pages.blog.rechargingGuide.read");
  const articleRead = opt(dictionary, "pages.blog.restOfBlog.read");

  // Separate guide posts from other posts
  const guidePosts = useMemo(
    () => posts.filter((post) => post.categoryId === "recharging-guide"),
    [posts],
  );
  const otherPosts = useMemo(
    () => posts.filter((post) => post.categoryId !== "recharging-guide"),
    [posts],
  );

  // Extract all unique tags from guide posts
  const allTags = useMemo(() => {
    const tagMap = new Map<string, { id: string; name: string; slug: string; count: number }>();
    guidePosts.forEach((post) => {
      post.tags.forEach((tag) => {
        if (tagMap.has(tag.id)) {
          const existing = tagMap.get(tag.id)!;
          tagMap.set(tag.id, { ...existing, count: existing.count + 1 });
        } else {
          tagMap.set(tag.id, { ...tag, count: 1 });
        }
      });
    });
    return Array.from(tagMap.values()).sort((a, b) => b.count - a.count);
  }, [guidePosts]);

  // Group posts by tag
  const postsByTag = useMemo(() => {
    const grouped = new Map<string, TransformedPost[]>();
    allTags.forEach((tag) => {
      const postsWithTag = guidePosts.filter((post) =>
        post.tags.some((t) => t.id === tag.id),
      );
      if (postsWithTag.length > 0) {
        grouped.set(tag.id, postsWithTag);
      }
    });
    return grouped;
  }, [guidePosts, allTags]);

  // Track which tag sections are visible on screen
  const { hiddenTags, registerSection } = useVisibleTagSections(allTags);

  // Categories for filtering (non-guide articles)
  const categories = useMemo(
    () => Array.from(new Set(otherPosts.map((post) => post.category))),
    [otherPosts],
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [isSommaireStuck, setIsSommaireStuck] = useState(false);
  const [isMobileTagsExpanded, setIsMobileTagsExpanded] = useState(false);
  const sommaireRef = useRef<HTMLDivElement>(null);

  const filteredPosts = selectedCategory
    ? otherPosts.filter((post) => post.category === selectedCategory)
    : otherPosts;

  // Smooth scroll to tag section
  const scrollToSection = (tagId: string) => {
    const element = document.getElementById(`tag-section-${tagId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Detect when sommaire is stuck
  useEffect(() => {
    const sommaire = sommaireRef.current;
    if (!sommaire) return;

    const handleScroll = () => {
      const rect = sommaire.getBoundingClientRect();
      setIsSommaireStuck(rect.top <= 65);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [hiddenTags.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const quotePage = pageRegistry.find((p) => p.id === "quote");
  const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

  const miniQuote = (
    <div key="mini-quote-card" className={`${FOREST_SCOPE} [&>*]:h-full [&>*]:rounded-xl [&>*]:border-0 [&>*]:shadow-none`}>
      <MiniQuoteCard pageId="blog" dictionary={dictionary} pageRegistry={pageRegistry} lang={lang} />
    </div>
  );

  const tagsLabel = d("pages.blog.rechargingGuide.tags.label", { count: allTags.length });
  const ctaTitle = opt(dictionary, "pages.blog.blocks.getquote.headline");
  const ctaLabel = opt(dictionary, "pages.blog.blocks.getquote.cta.label");

  return (
    <div data-direction-b className="bg-b-paper">
      {/* Hero — text left, photograph right: the title never depends on the
          photo for contrast. Without an image the text takes the full width. */}
      <section className="py-12 md:pt-20 md:pb-18">
        <Container className={hasImage ? "grid items-center gap-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-14" : ""}>
          <div>
            {opt(dictionary, "pages.blog.hero.eyebrow") && <Eyebrow>{opt(dictionary, "pages.blog.hero.eyebrow")}</Eyebrow>}
            <h1
              className="mb-4 font-heading text-4xl font-semibold leading-[1.06] tracking-[-0.04em] md:mb-5 md:text-[56px] md:leading-[1.04]"
              data-testid="heading-blog-title"
            >
              {heroTitle}
            </h1>
            <p className="max-w-[35rem] text-[17px] leading-relaxed text-muted-foreground md:text-lg" data-testid="text-blog-subtitle">
              {heroSubtitle}
            </p>
          </div>
          {hasImage && (
            <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-b-inset max-lg:hidden">
              <Image
                src={heroImage!}
                alt=""
                fill
                priority
                // LCP element of the blog listing on desktop.
                fetchPriority="high"
                quality={60}
                sizes="(max-width: 1240px) 45vw, 540px"
                className="object-cover object-center"
              />
            </div>
          )}
        </Container>
      </section>

      {/* Guide de la recharge — grouped by tag, sticky table of contents */}
      {guidePosts.length > 0 && (
        <section id="guide-section" className="bg-b-sand pt-10 md:pt-18">
          <Container className="mb-5 md:mb-7">
            <div className="max-w-[40rem]">
              {opt(dictionary, "pages.blog.rechargingGuide.eyebrow") ? (
                <p className="type-label mb-4 flex items-center gap-2.5 tracking-[0.12em] text-muted-foreground">
                  <BookOpen className="h-4 w-4 text-b-link" aria-hidden />
                  {opt(dictionary, "pages.blog.rechargingGuide.eyebrow")}
                </p>
              ) : (
                <BookOpen className="mb-4 h-6 w-6 text-b-link" aria-hidden />
              )}
              <SectionTitle className="mb-3.5">
                <span data-testid="heading-guide-section">
                  {guideSectionTitle || d("pages.blog.rechargingGuide.headline")}
                </span>
              </SectionTitle>
              {guideSectionSubtitle && !guideSectionSubtitle.startsWith("[") && (
                <p className="type-body text-muted-foreground" data-testid="text-guide-section-subheadline">
                  {guideSectionSubtitle}
                </p>
              )}
            </div>
          </Container>

          {/* Sticky table of contents: the tags whose section is off screen */}
          {hiddenTags.length > 0 && (
            <div
              ref={sommaireRef}
              className={`sticky top-16 z-40 border-y transition-[background-color,box-shadow,border-color] duration-200 ${
                isSommaireStuck
                  ? "border-border bg-b-paper shadow-[0_8px_20px_-14px_rgba(7,35,26,.3)]"
                  : "border-transparent"
              }`}
            >
              {/* Desktop: one scrolling row */}
              <Container className="hidden h-15 items-center gap-3.5 md:flex">
                <nav
                  aria-label={tagsLabel}
                  className="flex min-w-0 items-center gap-3.5 overflow-x-auto [scrollbar-width:none]"
                  data-testid="nav-table-of-contents"
                >
                  <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-sm font-semibold text-muted-foreground">
                    <List className="h-4 w-4 text-b-link" aria-hidden />
                    {tagsLabel}
                  </span>
                  <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
                  {hiddenTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => scrollToSection(tag.id)}
                      className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md border border-border bg-card px-3.5 text-sm font-medium transition-colors hover:bg-b-inset focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      data-testid={`link-tag-${tag.slug}`}
                    >
                      {tag.name}
                    </button>
                  ))}
                </nav>
              </Container>

              {/* Mobile: collapsible */}
              <div className="bg-b-paper md:hidden">
                <button
                  type="button"
                  onClick={() => setIsMobileTagsExpanded(!isMobileTagsExpanded)}
                  aria-expanded={isMobileTagsExpanded}
                  className="flex h-14 w-full items-center justify-between px-5 text-[15px] font-semibold"
                  data-testid="button-toggle-mobile-tags"
                >
                  <span className="flex items-center gap-2.5">
                    <List className="h-4 w-4 text-b-link" aria-hidden />
                    {tagsLabel}
                  </span>
                  <ChevronDown
                    className={`h-4.5 w-4.5 text-muted-foreground transition-transform ${isMobileTagsExpanded ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
                {isMobileTagsExpanded && (
                  <div className="flex flex-wrap gap-2 px-5 pb-4">
                    {hiddenTags.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => {
                          scrollToSection(tag.id);
                          setIsMobileTagsExpanded(false);
                        }}
                        className="inline-flex h-11 items-center rounded-md border border-border bg-card px-3.5 text-sm font-medium"
                        data-testid={`link-tag-mobile-${tag.slug}`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tag-based Article Sections — alternating Sand / Inset */}
          {allTags.map((tag, tagIndex) => {
            const postsForTag = postsByTag.get(tag.id) || [];
            if (postsForTag.length === 0) return null;

            return (
              <div
                key={tag.id}
                id={`tag-section-${tag.id}`}
                ref={(el) => registerSection(tag.id, el)}
                className={`scroll-mt-[136px] py-9 md:pb-12 ${tagIndex % 2 === 1 ? "bg-b-inset" : ""}`}
              >
                <Container>
                  <div className="mb-6 flex items-center gap-3">
                    <span className="inline-flex h-8 items-center rounded-md bg-b-forest px-3 text-sm font-semibold text-b-on-forest">
                      {tag.name}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {d("pages.blog.rechargingGuide.articles.label", { count: postsForTag.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                    {postsForTag.flatMap((post, index) => {
                      const node = card(post, guideRead, tagIndex === 0 && index < 3);
                      // Mini-quote card in 3rd position of the first section.
                      return tagIndex === 0 && index === 2 ? [miniQuote, node] : [node];
                    })}
                  </div>
                </Container>
              </div>
            );
          })}

          {/* Fallback: Show guide posts grid if no tags */}
          {allTags.length === 0 && (
            <Container className="py-9">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
                {guidePosts.flatMap((post, index) => {
                  const node = card(post, guideRead, index < 3);
                  return index === 2 ? [miniQuote, node] : [node];
                })}
              </div>
            </Container>
          )}
        </section>
      )}

      {/* Other Articles Section */}
      {otherPosts.length > 0 && (
        <section className="pt-12 pb-14 md:pt-24 md:pb-28">
          <Container className="max-md:px-0">
            <SectionTitle className="mb-5 max-md:px-5 md:mb-6">
              <span data-testid="heading-articles-section">{d("pages.blog.restOfBlog.headline")}</span>
            </SectionTitle>
            <div
              role="group"
              aria-label={d("pages.blog.restOfBlog.tags.all")}
              className="mb-8 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] md:flex-wrap md:overflow-visible md:px-0"
            >
              <button
                type="button"
                aria-pressed={selectedCategory === null}
                onClick={() => setSelectedCategory(null)}
                className={chipClass(selectedCategory === null)}
                data-testid="badge-category-all"
              >
                {d("pages.blog.restOfBlog.tags.all")}
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={selectedCategory === category}
                  onClick={() => setSelectedCategory(category)}
                  className={chipClass(selectedCategory === category)}
                  data-testid={`badge-category-${category}`}
                >
                  {category}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-4 max-md:px-5 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
              {filteredPosts.map((post) => card(post, articleRead, false))}
            </div>
          </Container>
        </section>
      )}

      {ctaTitle && ctaLabel && (
        <div className="pb-14">
          <CtaB
            title={ctaTitle}
            subtitle={opt(dictionary, "pages.blog.blocks.getquote.subheadline")}
            primary={{ label: ctaLabel, href: quoteHref }}
            note={opt(dictionary, "pages.blog.blocks.getquote.note")}
          />
        </div>
      )}
    </div>
  );
}
