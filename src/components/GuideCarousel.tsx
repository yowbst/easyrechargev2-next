"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import useEmblaCarousel from "embla-carousel-react";
import { useCallback } from "react";
import { cmsBgImage } from "@/lib/directusAssets";
import { BlogCard } from "@/components/BlogCard";
import { t } from "@/lib/i18n/dictionaries";
import type { PageRegistryEntry } from "@/lib/directus-queries";

interface PostData {
  id: string;
  title: string;
  excerpt: string;
  readingTime: number;
  image: string;
  category: string;
  categorySlug: string;
  slug: string;
  tag?: string;
}

interface GuideCarouselProps {
  title?: string;
  subtitle?: string;
  ctaLabel?: string;
  ctaHref: string;
  posts: PostData[] | undefined;
  image?: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
}

export function GuideCarousel({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  posts,
  image,
  dictionary,
  pageRegistry,
}: GuideCarouselProps) {
  const hasImage = !!image;

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    loop: false,
    skipSnaps: false,
    dragFree: true,
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const transformedPosts = posts || [];
  const resolvedTitle = title || "";
  const resolvedSubtitle = subtitle || "";
  const resolvedCtaLabel = ctaLabel || "";

  const carouselContent = (
    <div className="relative">
      {!posts ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : transformedPosts.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t(dictionary, "common.noArticles")}
        </div>
      ) : (
        <>
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex gap-6">
              {transformedPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex-[0_0_100%] min-w-0 sm:flex-[0_0_80%] md:flex-[0_0_45%] lg:flex-[0_0_30%]"
                >
                  <BlogCard
                    id={post.id}
                    title={post.title}
                    category={post.category}
                    categorySlug={post.categorySlug}
                    slug={post.slug}
                    readingTime={post.readingTime}
                    image={post.image}
                    excerpt={post.excerpt}
                    tag={post.tag}
                    showCategory={false}
                    variant={hasImage ? "dark" : "default"}
                    dictionary={dictionary}
                    pageRegistry={pageRegistry}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-center mt-8">
            <Button
              variant={hasImage ? "ghost" : "outline"}
              size="icon"
              onClick={scrollPrev}
              aria-label="Previous"
              className={hasImage ? "text-white border border-white/20 hover:bg-white/10" : ""}
              data-testid="button-carousel-prev"
            >
              <ArrowRight className="h-4 w-4 rotate-180" />
            </Button>
            <Button
              variant={hasImage ? "ghost" : "outline"}
              size="icon"
              onClick={scrollNext}
              aria-label="Next"
              className={hasImage ? "text-white border border-white/20 hover:bg-white/10" : ""}
              data-testid="button-carousel-next"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );

  if (hasImage) {
    return (
      <section
        className="relative py-24 overflow-hidden border-y"
        style={{ backgroundImage: `url(${cmsBgImage(image!)})`, backgroundSize: "cover", backgroundPosition: "center" }}
        data-testid="section-guide-carousel"
      >
        <div className="absolute inset-0 bg-slate-900/70" />

        <div className="relative z-10 container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-heading font-bold text-white mb-4" data-testid="heading-guide-title">
              {resolvedTitle}
            </h2>
            {resolvedSubtitle && !resolvedSubtitle.startsWith("[") && (
              <p className="text-lg text-white/75 max-w-3xl mx-auto" data-testid="text-guide-subtitle">
                {resolvedSubtitle}
              </p>
            )}
          </div>

          {carouselContent}

          <div className="flex justify-center mt-12">
            <Link
              href={ctaHref}
              className="inline-flex items-center justify-center gap-2 min-w-[240px] rounded-lg border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 text-sm font-medium"
              data-testid="button-view-all-guides"
            >
              {resolvedCtaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-primary/5 via-background to-primary/5 border-y py-24" data-testid="section-guide-carousel">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-heading font-bold mb-4" data-testid="heading-guide-title">
            {resolvedTitle}
          </h2>
          {resolvedSubtitle && !resolvedSubtitle.startsWith("[") && (
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto mb-6" data-testid="text-guide-subtitle">
              {resolvedSubtitle}
            </p>
          )}
        </div>

        {carouselContent}

        <div className="flex justify-center mt-12">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center gap-2 min-w-[240px] rounded-lg border border-border bg-background hover:bg-muted h-9 px-4 text-sm font-medium"
            data-testid="button-view-all-guides"
          >
            {resolvedCtaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
