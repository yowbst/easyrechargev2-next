"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

/**
 * Rotating hero backdrop.
 *
 * The first image is the page's LCP element, so it renders server-side with
 * `priority` and stays exactly as costly as a single static hero.
 *
 * The rest are fetched one ahead of the rotation rather than all at once: at
 * any moment the browser has downloaded what has been shown plus the next
 * frame. With five or six photographs that is the difference between a few
 * hundred kilobytes and several megabytes on a phone, for a backdrop most
 * visitors will scroll past.
 *
 * Rotation is skipped entirely for `prefers-reduced-motion`, and for a single
 * image there is nothing to schedule.
 */
export function HeroBackdrop({
  images,
  alt,
  intervalMs,
}: {
  images: string[];
  alt: string;
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);
  /** How many images are in the DOM. Grows one step ahead of `index`. */
  const [mounted, setMounted] = useState(1);

  // Fetch the second image once the browser is idle — never during the window
  // that decides LCP.
  useEffect(() => {
    if (images.length < 2) return;
    const w = window as typeof window & {
      requestIdleCallback?: (cb: () => void) => number;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(() => setMounted((n) => Math.max(n, 2)))
      : window.setTimeout(() => setMounted((n) => Math.max(n, 2)), 1200);
    return () => window.clearTimeout(id as number);
  }, [images.length]);

  useEffect(() => {
    if (images.length < 2 || mounted < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % images.length;
        // Bring the frame after this one into the DOM so it has a full
        // interval to download before it is shown.
        setMounted((n) => Math.min(images.length, Math.max(n, next + 2)));
        return next;
      });
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [images.length, mounted, intervalMs]);

  return (
    <>
      {images.map((src, i) => {
        // Nothing beyond the fetch-ahead window exists yet.
        if (i >= mounted) return null;
        return (
          <Image
            key={src}
            src={src}
            // The backdrop is decorative once it rotates — the alt text belongs
            // to the first frame, which is the one that carries meaning.
            alt={i === 0 ? alt : ""}
            fill
            priority={i === 0}
            fetchPriority={i === 0 ? "high" : "low"}
            quality={70}
            sizes="100vw"
            aria-hidden={i > 0 || undefined}
            className={`-z-20 object-cover object-center transition-opacity duration-1000 ease-in-out ${
              i === index ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}
    </>
  );
}
