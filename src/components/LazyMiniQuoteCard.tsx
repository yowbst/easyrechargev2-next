"use client";

import dynamic from "next/dynamic";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { LocalityResponse } from "@/lib/localities";

// Code-split (dynamic in a client component only loads the chunk where the
// card renders) but SSR ENABLED: with ssr:false the card popped in after
// hydration and, on mobile where the sidebar sits above the content column,
// pushed the entire page down — CLS 0.43 on every locality subsidies page.
const MiniQuoteCard = dynamic(() =>
  import("@/components/MiniQuoteCard").then((m) => m.MiniQuoteCard),
);

interface LazyMiniQuoteCardProps {
  className?: string;
  pageId?: string;
  dictionary: Record<string, string>;
  pageRegistry: PageRegistryEntry[];
  lang: string;
  interpolationValues?: Record<string, string>;
  defaultLocality?: LocalityResponse;
}

export function LazyMiniQuoteCard(props: LazyMiniQuoteCardProps) {
  return <MiniQuoteCard {...props} />;
}
