"use client";

import { useRef } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow, SectionTitle } from "./Shell";
import { CarouselArrows, CarouselDots, useCarousel } from "./Carousel";
import { PostCard, type PostCardData } from "./PostCard";

export type GuidePost = PostCardData;

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
              <p className="type-body mt-4 text-muted-foreground">
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
          <PostCard
            key={post.id}
            post={post}
            readingTimeLabel={readingTimeLabel}
            readLabel={readLabel}
            testId={`card-guide-${post.id}`}
            className="shrink-0 snap-start basis-[min(100%,20rem)] lg:basis-[calc((min(100vw,1240px)-5rem-3rem)/3)]"
          />
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
