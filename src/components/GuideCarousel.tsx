"use client";

import { useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";

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
  posts: PostData[];
  lang: string;
  blogSlug: string;
}

export function GuideCarousel({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
  posts,
  lang,
  blogSlug,
}: GuideCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    dragFree: true,
    containScroll: "trimSnaps",
  });

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  if (!posts.length) return null;

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8">
          <div>
            {title && (
              <h2 className="font-heading text-3xl font-bold mb-2">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {ctaLabel && (
            <Link href={ctaHref}>
              <Button variant="outline" className="hidden md:flex gap-2">
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>

        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex gap-6">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex-[0_0_85%] min-w-0 md:flex-[0_0_45%] lg:flex-[0_0_30%]"
              >
                <Link
                  href={`/${lang}/${blogSlug}/${post.categorySlug}/${post.slug}`}
                >
                  <Card className="overflow-hidden h-full hover:border-primary/50 transition-colors">
                    <div className="relative aspect-[16/10]">
                      <Image
                        src={post.image}
                        alt={post.title}
                        fill
                        className="object-cover"
                      />
                      {post.tag && (
                        <span className="absolute top-3 left-3 bg-primary text-primary-foreground px-2 py-0.5 rounded text-xs font-medium">
                          {post.tag}
                        </span>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{post.category}</span>
                        <span>·</span>
                        <span>
                          {post.readingTime} min{" "}
                          {lang === "de" ? "Lesezeit" : "de lecture"}
                        </span>
                      </div>
                      <h3 className="font-semibold line-clamp-2">
                        {post.title}
                      </h3>
                      {post.excerpt && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {post.excerpt}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {ctaLabel && (
          <div className="mt-6 md:hidden text-center">
            <Link href={ctaHref}>
              <Button variant="outline" className="gap-2">
                {ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
