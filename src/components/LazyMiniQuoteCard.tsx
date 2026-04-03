"use client";

import dynamic from "next/dynamic";
import type { PageRegistryEntry } from "@/lib/directus-queries";

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
}

export function LazyMiniQuoteCard(props: LazyMiniQuoteCardProps) {
  return <MiniQuoteCard {...props} />;
}
