"use client";

import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { BookOpen, List, ChevronDown, ChevronUp } from "lucide-react";
import { BlogCard } from "@/components/BlogCard";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { GetQuote } from "@/components/GetQuote";
import { cmsImage } from "@/lib/directusAssets";
import { useVisibleTagSections } from "@/hooks/useVisibleTagSections";
import { t } from "@/lib/i18n/dictionaries";
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

export function BlogListing({
  posts,
  heroTitle,
  heroSubtitle,
  heroImage,
  guideSectionTitle,
  guideSectionSubtitle,
  getQuoteBlock,
  dictionary,
  pageRegistry,
  lang,
}: BlogListingProps) {
  const hasImage = !!heroImage;
  const d = (key: string, vars?: Record<string, string | number>) => t(dictionary, key, vars);

  // Spotlight effect
  const heroRef = useRef<HTMLElement>(null);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number } | null>(null);
  const handleHeroMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const rect = heroRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotlight({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);
  const handleHeroMouseLeave = useCallback(() => setSpotlight(null), []);

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

  // GetQuote block
  const getQuoteVariant = (() => {
    const variant = getQuoteBlock?.variant;
    if (variant === "grey") return "muted" as const;
    if (variant === "green") return "primary" as const;
    return "muted" as const;
  })();

  const quotePage = pageRegistry.find((p) => p.id === "quote");
  const quoteHref = quotePage ? `/${lang}/${quotePage.slugs[lang]}` : `/${lang}`;

  return (
    <div>
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative py-16 md:py-28 overflow-hidden"
        onMouseMove={hasImage ? handleHeroMouseMove : undefined}
        onMouseLeave={hasImage ? handleHeroMouseLeave : undefined}
      >
        {hasImage && (() => {
          const opt = cmsImage(heroImage!, [640, 1024, 1920], { quality: 75 });
          return (
            <>
              <img
                src={opt.src}
                srcSet={opt.srcSet}
                sizes="(max-width: 640px) 640px, (max-width: 1024px) 1024px, 1920px"
                alt=""
                fetchPriority="high"
                className="absolute inset-0 w-full h-full object-cover object-center"
              />
              <div
                className="absolute inset-0 transition-none"
                aria-hidden="true"
                style={{
                  background: spotlight
                    ? `radial-gradient(circle 280px at ${spotlight.x}px ${spotlight.y}px, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.78) 100%)`
                    : "rgba(15,23,42,0.75)",
                }}
              />
            </>
          );
        })()}
        {!hasImage && <div className="absolute inset-0 bg-muted/50" aria-hidden="true" />}

        <div className="relative container mx-auto px-4">
          <h1
            className={`text-4xl md:text-5xl font-heading font-bold text-center mb-4 ${hasImage ? "text-white" : ""}`}
            data-testid="heading-blog-title"
          >
            {heroTitle}
          </h1>
          <p
            className={`text-lg text-center max-w-2xl mx-auto ${hasImage ? "text-white/85" : "text-muted-foreground"}`}
            data-testid="text-blog-subtitle"
          >
            {heroSubtitle}
          </p>
        </div>
      </section>

      {/* Guide de la recharge - Highlighted Section with Sticky TOC */}
      {guidePosts.length > 0 && (
        <section
          id="guide-section"
          className="bg-gradient-to-br from-primary/5 via-background to-primary/5 border-y"
        >
          {/* Section Header */}
          <div className="py-12 pb-6">
            <div className="container mx-auto px-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <h2
                  className="text-4xl font-heading font-bold mb-3"
                  data-testid="heading-guide-section"
                >
                  {guideSectionTitle || d("pages.blog.rechargingGuide.headline")}
                </h2>
                {guideSectionSubtitle && !guideSectionSubtitle.startsWith("[") && (
                  <p
                    className="text-lg text-muted-foreground max-w-2xl mx-auto"
                    data-testid="text-guide-section-subheadline"
                  >
                    {guideSectionSubtitle}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Table of Contents */}
          {hiddenTags.length > 0 && (
            <div
              ref={sommaireRef}
              className={`sticky top-16 z-40 transition-colors duration-200 ${
                isSommaireStuck
                  ? "bg-background border-b shadow-sm"
                  : ""
              }`}
            >
              <div className="container mx-auto px-4 py-3">
                {/* Desktop: horizontal scrollable list */}
                <nav
                  className="hidden md:flex items-center gap-3 min-w-0 overflow-x-auto"
                  data-testid="nav-table-of-contents"
                >
                  <List className="h-4 w-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium text-muted-foreground flex-shrink-0">
                    {d("pages.blog.rechargingGuide.tags.label", { count: allTags.length })}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hiddenTags.map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="cursor-pointer hover-elevate flex-shrink-0"
                        onClick={() => scrollToSection(tag.id)}
                        data-testid={`link-tag-${tag.slug}`}
                      >
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                </nav>

                {/* Mobile: collapsible list */}
                <div className="md:hidden">
                  <button
                    onClick={() => setIsMobileTagsExpanded(!isMobileTagsExpanded)}
                    className="flex items-center justify-between w-full"
                    data-testid="button-toggle-mobile-tags"
                  >
                    <div className="flex items-center gap-2">
                      <List className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">
                        {d("pages.blog.rechargingGuide.tags.label", { count: allTags.length })}
                      </span>
                    </div>
                    {isMobileTagsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                  {isMobileTagsExpanded && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {hiddenTags.map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="cursor-pointer hover-elevate"
                          onClick={() => {
                            scrollToSection(tag.id);
                            setIsMobileTagsExpanded(false);
                          }}
                          data-testid={`link-tag-mobile-${tag.slug}`}
                        >
                          {tag.name}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tag-based Article Sections */}
          {allTags.map((tag, tagIndex) => {
            const postsForTag = postsByTag.get(tag.id) || [];
            if (postsForTag.length === 0) return null;

            const isEven = tagIndex % 2 === 0;

            return (
              <div
                key={tag.id}
                id={`tag-section-${tag.id}`}
                ref={(el) => registerSection(tag.id, el)}
                className={`py-10 scroll-mt-24 ${isEven ? "" : "bg-background/50"}`}
              >
                <div className="container mx-auto px-4">
                  <div className="flex items-center gap-3 mb-6">
                    <Badge variant="default" className="text-sm px-3 py-1">
                      {tag.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {d("pages.blog.rechargingGuide.articles.label", { count: postsForTag.length })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {postsForTag.flatMap((post, index) => {
                      // Insert MiniQuoteCard at position 3 in the first tag section
                      if (tagIndex === 0 && index === 2) {
                        return [
                          <MiniQuoteCard
                            key="mini-quote-card"
                            pageId="blog"
                            dictionary={dictionary}
                            pageRegistry={pageRegistry}
                            lang={lang}
                          />,
                          <BlogCard
                            key={post.id}
                            {...post}
                            dictionary={dictionary}
                            pageRegistry={pageRegistry}
                          />,
                        ];
                      }
                      return [
                        <BlogCard
                          key={post.id}
                          {...post}
                          dictionary={dictionary}
                          pageRegistry={pageRegistry}
                        />,
                      ];
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Fallback: Show guide posts grid if no tags */}
          {allTags.length === 0 && (
            <div className="py-8">
              <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {guidePosts.flatMap((post, index) => {
                    if (index === 2) {
                      return [
                        <MiniQuoteCard
                          key="mini-quote-card"
                          pageId="blog"
                          dictionary={dictionary}
                          pageRegistry={pageRegistry}
                          lang={lang}
                        />,
                        <BlogCard
                          key={post.id}
                          {...post}
                          dictionary={dictionary}
                          pageRegistry={pageRegistry}
                        />,
                      ];
                    }
                    return [
                      <BlogCard
                        key={post.id}
                        {...post}
                        dictionary={dictionary}
                        pageRegistry={pageRegistry}
                      />,
                    ];
                  })}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Other Articles Section */}
      {otherPosts.length > 0 && (
        <section className="py-12">
          <div className="container mx-auto px-4">
            <div className="mb-8">
              <h2
                className="text-3xl font-heading font-bold mb-6"
                data-testid="heading-articles-section"
              >
                {d("pages.blog.restOfBlog.headline")}
              </h2>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant={selectedCategory === null ? "default" : "outline"}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(null)}
                  data-testid="badge-category-all"
                >
                  {d("pages.blog.restOfBlog.tags.all")}
                </Badge>
                {categories.map((category) => (
                  <Badge
                    key={category}
                    variant={selectedCategory === category ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(category)}
                    data-testid={`badge-category-${category}`}
                  >
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.map((post) => (
                <BlogCard
                  key={post.id}
                  {...post}
                  dictionary={dictionary}
                  pageRegistry={pageRegistry}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* GetQuote CTA */}
      <GetQuote
        variant={getQuoteVariant}
        title={d("pages.blog.blocks.getquote.headline")}
        subtitle={d("pages.blog.blocks.getquote.subheadline")}
        ctaLabel={d("pages.blog.blocks.getquote.cta.label")}
        ctaHref={quoteHref}
        note={d("pages.blog.blocks.getquote.note")}
        image={getQuoteBlock?.image}
      />
    </div>
  );
}
