"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

/**
 * Scroll-snap carousel plumbing, shared by the guides and the mobile
 * testimonials.
 *
 * Native scroll rather than a JS track: the strip stays swipeable, keyboard
 * scrollable and readable with JS still loading, and the arrows only nudge
 * `scrollBy`. Page count is measured from the real rendered card width, so it
 * follows the breakpoint instead of being hardcoded per viewport.
 */
export function useCarousel<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [{ index, pages }, setState] = useState({ index: 0, pages: 1 });
  const step = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    const first = el?.firstElementChild as HTMLElement | undefined;
    if (!el || !first) return;
    const styles = getComputedStyle(el);
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const cardWidth = first.getBoundingClientRect().width + gap;
    const padding = parseFloat(styles.paddingLeft) || 0;
    const perPage = Math.max(
      1,
      Math.round((el.clientWidth - padding * 2 + gap) / cardWidth),
    );
    step.current = cardWidth * perPage;
    const nextPages = Math.max(1, Math.ceil(el.children.length / perPage));
    const nextIndex = Math.min(
      nextPages - 1,
      Math.round(el.scrollLeft / (step.current || 1)),
    );
    setState((prev) =>
      prev.index === nextIndex && prev.pages === nextPages
        ? prev
        : { index: nextIndex, pages: nextPages },
    );
  }, [ref]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const go = (direction: -1 | 1) => {
    ref.current?.scrollBy({
      left: direction * (step.current || 300),
      behavior: "smooth",
    });
  };

  return {
    index,
    pages,
    onScroll: measure,
    prev: () => index > 0 && go(-1),
    next: () => index < pages - 1 && go(1),
    canPrev: index > 0,
    canNext: index < pages - 1,
  };
}

/** Page dots — decorative; the strip itself is the accessible control. */
export function CarouselDots({ index, pages }: { index: number; pages: number }) {
  if (pages <= 1) return null;
  return (
    <div className="flex gap-1.5" aria-hidden>
      {Array.from({ length: pages }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 rounded-full transition-all duration-200 ${
            i === index ? "w-7 bg-b-forest" : "w-2 bg-partner-dashed"
          }`}
        />
      ))}
    </div>
  );
}

export function CarouselArrows({
  canPrev,
  canNext,
  onPrev,
  onNext,
  prevLabel,
  nextLabel,
}: {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const cls = (enabled: boolean) =>
    `inline-flex size-11 items-center justify-center rounded-md border-[1.5px] transition-colors ${
      enabled
        ? "cursor-pointer border-foreground bg-card text-foreground"
        : "cursor-default border-border text-muted-foreground/60"
    }`;
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label={prevLabel}
        className={cls(canPrev)}
      >
        <ArrowLeft className="size-[18px]" />
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label={nextLabel}
        className={cls(canNext)}
      >
        <ArrowRight className="size-[18px]" />
      </button>
    </div>
  );
}
