/**
 * Convert SeoData → Next.js Metadata objects for generateMetadata functions.
 */

import type { Metadata } from "next";
import type { SeoData } from "./resolver";

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";
const DEFAULT_OG_IMAGE = `${SITE_URL}/og-default.webp`;

export function buildMetadata(seo: SeoData): Metadata {
  const ogImage = seo.ogImage || DEFAULT_OG_IMAGE;

  // Build alternates languages map
  const languages: Record<string, string> = {};
  for (const alt of seo.alternates) {
    languages[alt.lang] = alt.url;
  }
  // x-default points to French
  const frAlt = seo.alternates.find((a) => a.lang === "fr");
  if (frAlt) languages["x-default"] = frAlt.url;

  const metadata: Metadata = {
    title: seo.title,
    description: seo.description,
    alternates: {
      canonical: seo.canonical,
      languages,
    },
    openGraph: {
      title: seo.title,
      description: seo.description,
      url: seo.canonical,
      siteName: "easyRecharge",
      type: seo.ogType === "article" ? "article" : "website",
      locale: seo.lang === "de" ? "de_CH" : "fr_CH",
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: ogImage ? [ogImage] : undefined,
    },
  };

  // Article-specific OG metadata
  if (seo.ogType === "article" && seo.articleMeta) {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: "article",
      publishedTime: seo.articleMeta.publishedTime,
      modifiedTime: seo.articleMeta.modifiedTime,
      section: seo.articleMeta.section,
    } as Metadata["openGraph"];
  }

  // Robots
  if (seo.robots?.includes("noindex")) {
    metadata.robots = { index: false, follow: false };
  }

  return metadata;
}
