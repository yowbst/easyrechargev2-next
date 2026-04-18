"use client";

import dynamic from "next/dynamic";
import type { PageRegistryEntry } from "@/lib/directus-queries";
import type { LocalityResponse } from "@/lib/localities";

const MiniQuoteCard = dynamic(
  () => import("@/components/MiniQuoteCard").then((m) => m.MiniQuoteCard),
  { ssr: false },
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
