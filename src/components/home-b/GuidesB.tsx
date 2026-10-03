"use client";

import { useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Clock } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";
import { CarouselArrows, CarouselDots, useCarousel } from "./Carousel";

export interface GuidePost {
  id: string;
  title: string;
  excerpt: string;
  readingTime: number;
  image: string;
  category: string;
  tag?: string;
  href: string;
}

/**
 * Blog guides on the home page. Three cards visible on desktop, one on mobile,
 * paging by a full screenful rather than one card — the design's arrows move a
 * page, which is what makes the dot count meaningful.
 */
export function GuidesB({
  eyebrow,
  title,
  lede,
  posts,
  action,
  readingTimeLabel,
  readLabel,
  prevLabel,
  nextLabel,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  posts: GuidePost[];
  action?: { label: string; href: string };
  /** e.g. "{n} min de lecture" — `{n}` is replaced. */
  readingTimeLabel: string;
  readLabel?: string;
  prevLabel: string;
  nextLabel: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const carousel = useCarousel(stripRef);
  if (posts.length === 0) return null;

  return (
    <section data-reveal className="bg-b-paper py-14">
      <Container>
        <div className="mb-9 flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          <div className="max-w-[40rem]">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <SectionTitle>{title}</SectionTitle>
            {lede && (
              <p className="mt-4 text-[17px] leading-[1.65] text-muted-foreground">
                {lede}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <CarouselDots index={carousel.index} pages={carousel.pages} />
            <CarouselArrows
              canPrev={carousel.canPrev}
              canNext={carousel.canNext}
              onPrev={carousel.prev}
              onNext={carousel.next}
              prevLabel={prevLabel}
              nextLabel={nextLabel}
            />
          </div>
        </div>
      </Container>

      {/* The strip bleeds to the viewport edge so a partially visible card
          signals "there is more", while scroll-padding keeps the snapped card
          aligned with the container. */}
      <div
        ref={stripRef}
        onScroll={carousel.onScroll}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 [scrollbar-width:none] md:gap-6 md:scroll-px-10 md:px-10 [&::-webkit-scrollbar]:hidden"
      >
        {posts.map((post) => (
          <Link
            key={post.id}
            href={post.href}
            className="flex shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-card text-foreground basis-[min(100%,20rem)] lg:basis-[calc((min(100vw,1240px)-5rem-3rem)/3)]"
            data-testid={`card-guide-${post.id}`}
          >
            <div className="relative aspect-[16/9] bg-b-inset">
              <Image
                src={post.image}
                alt=""
                fill
                quality={60}
                sizes="(max-width: 1024px) 90vw, 380px"
                className="object-cover object-center"
              />
              {post.tag && (
                <span className="absolute left-3.5 top-3.5 inline-flex h-7 items-center rounded-md bg-b-charge px-2.5 text-[13px] font-semibold text-b-on-charge">
                  {post.tag}
                </span>
              )}
            </div>
            <div className="flex flex-1 flex-col p-5 md:px-6 md:pb-6 md:pt-5.5">
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="inline-flex h-[26px] items-center rounded-md bg-b-sand px-2.5 font-semibold">
                  {post.category}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden />
                  {readingTimeLabel.replace("{n}", String(post.readingTime))}
                </span>
              </div>
              <h3 className="mb-2.5 font-heading text-2xl font-semibold leading-[1.15] tracking-[-0.03em]">
                {post.title}
              </h3>
              <p className="mb-4.5 flex-1 text-[15px] leading-[1.55] text-muted-foreground">
                {post.excerpt}
              </p>
              {readLabel && (
                <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-b-link">
                  {readLabel}
                  <ArrowRight className="size-[15px]" aria-hidden />
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {action && (
        <Container className="mt-10">
          <div className="flex justify-center">
            <Link
              href={action.href}
              className="inline-flex h-13 items-center gap-2.5 rounded-md bg-b-sand px-6 text-[15px] font-semibold text-foreground transition-opacity hover:opacity-85"
            >
              {action.label}
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </Container>
      )}
    </section>
  );
}
