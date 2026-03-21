"use client";

import React, { useState, useMemo, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { BlogCard } from "@/components/BlogCard";
import { MiniQuoteCard } from "@/components/MiniQuoteCard";
import { cmsBgImage } from "@/lib/directusAssets";
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

interface BlogListingProps {
  posts: TransformedPost[];
  heroTitle: string;
  heroSubtitle: string;
  heroImage?: string;
  guideSectionTitle?: string;
  guideSectionSubtitle?: string;
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
  dictionary,
  pageRegistry,
  lang,
}: BlogListingProps) {
  const hasImage = !!heroImage;

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

  // Categories for filtering (non-guide articles)
  const categories = useMemo(
    () => Array.from(new Set(otherPosts.map((post) => post.category))),
    [otherPosts],
  );

  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const filteredPosts = selectedCategory
    ? otherPosts.filter((post) => post.category === selectedCategory)
    : otherPosts;

  return (
    <div>
      {/* Hero Section */}
      <section
        ref={heroRef}
        className="relative py-16 md:py-28 overflow-hidden"
        style={hasImage ? { backgroundImage: `url(${cmsBgImage(heroImage!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
        onMouseMove={hasImage ? handleHeroMouseMove : undefined}
        onMouseLeave={hasImage ? handleHeroMouseLeave : undefined}
      >
        {/* Spotlight overlay — dark base with a lighter circle following the cursor */}
        {hasImage && (
          <div
            className="absolute inset-0 transition-none"
            aria-hidden="true"
            style={{
              background: spotlight
                ? `radial-gradient(circle 280px at ${spotlight.x}px ${spotlight.y}px, rgba(15,23,42,0.35) 0%, rgba(15,23,42,0.78) 100%)`
                : "rgba(15,23,42,0.75)",
            }}
          />
        )}
        {!hasImage && <div className="absolute inset-0 bg-muted/50" />}

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

      {/* Guide de la recharge Section */}
      {guidePosts.length > 0 && (
        <section id="guide-section" className="bg-gradient-to-br from-primary/5 via-background to-primary/5 border-y">
          <div className="py-12 pb-6">
            <div className="container mx-auto px-4">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                  <BookOpen className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-4xl font-heading font-bold mb-3" data-testid="heading-guide-section">
                  {guideSectionTitle || t(dictionary, "pages.blog.rechargingGuide.headline")}
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-guide-section-subheadline">
                  {guideSectionSubtitle || t(dictionary, "pages.blog.rechargingGuide.subheadline", { count: guidePosts.length })}
                </p>
              </div>
            </div>
          </div>

          {/* Tag Navigation */}
          {allTags.length > 0 && (
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center gap-2 flex-wrap justify-center">
                {allTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="secondary"
                    className="cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      const el = document.getElementById(`tag-section-${tag.id}`);
                      el?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    {tag.name} ({tag.count})
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Posts by Tag */}
          <div className="container mx-auto px-4 pb-16">
            {allTags.map((tag, tagIndex) => {
              const tagPosts = postsByTag.get(tag.id) || [];
              if (tagPosts.length === 0) return null;

              return (
                <div key={tag.id} id={`tag-section-${tag.id}`} className="mb-16 last:mb-0 scroll-mt-24">
                  <h3 className="text-2xl font-heading font-bold mb-6">{tag.name}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tagPosts.map((post, postIndex) => (
                      <React.Fragment key={post.id}>
                        {/* Insert MiniQuoteCard at position 3 in the first tag section */}
                        {tagIndex === 0 && postIndex === 3 && (
                          <MiniQuoteCard
                            pageId="blog"
                            dictionary={dictionary}
                            pageRegistry={pageRegistry}
                            lang={lang}
                          />
                        )}
                        <BlogCard
                          id={post.id}
                          title={post.title}
                          category={post.category}
                          categorySlug={post.categorySlug}
                          slug={post.slug}
                          readingTime={post.readingTime}
                          image={post.image}
                          excerpt={post.excerpt}
                          date={post.date}
                          dictionary={dictionary}
                          pageRegistry={pageRegistry}
                        />
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Other Articles */}
      {otherPosts.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-heading font-bold mb-6" data-testid="heading-other-articles">
              {t(dictionary, "pages.blog.otherArticles.headline")}
            </h2>

            {/* Category filter */}
            {categories.length > 1 && (
              <div className="flex items-center gap-2 flex-wrap mb-8">
                <Badge
                  variant={selectedCategory === null ? "default" : "secondary"}
                  className="cursor-pointer"
                  onClick={() => setSelectedCategory(null)}
                >
                  {t(dictionary, "pages.blog.otherArticles.filterAll")}
                </Badge>
                {categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant={selectedCategory === cat ? "default" : "secondary"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory(cat)}
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredPosts.map((post) => (
                <BlogCard
                  key={post.id}
                  id={post.id}
                  title={post.title}
                  category={post.category}
                  categorySlug={post.categorySlug}
                  slug={post.slug}
                  readingTime={post.readingTime}
                  image={post.image}
                  excerpt={post.excerpt}
                  date={post.date}
                  dictionary={dictionary}
                  pageRegistry={pageRegistry}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
