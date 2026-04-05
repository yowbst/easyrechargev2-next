"use client";

import dynamic from "next/dynamic";

export const LazySwissMap = dynamic(
  () => import("@/components/SwissMap").then((m) => m.SwissMap),
  { ssr: false },
);

export const LazyTestimonials = dynamic(
  () => import("@/components/Testimonials").then((m) => m.Testimonials),
  { ssr: false },
);

export const LazyGuideCarousel = dynamic(
  () => import("@/components/GuideCarousel").then((m) => m.GuideCarousel),
  { ssr: false },
);
