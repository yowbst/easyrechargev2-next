/**
 * JSON-LD structured data builders.
 * Pure functions — copied from server/seo/jsonLd.ts.
 */

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";

// ── Organization ────────────────────────────────────────────────────────

export function buildOrganization(input: {
  logoUrl: string;
  socialLinks?: Array<{ platform: string; url: string }>;
}) {
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "easyRecharge",
    url: SITE_URL,
    logo: input.logoUrl,
    sameAs: input.socialLinks?.map((s) => s.url) ?? [],
  };
}

// ── WebSite ─────────────────────────────────────────────────────────────

export function buildWebSite() {
  return {
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    name: "easyRecharge",
    url: SITE_URL,
    publisher: { "@id": `${SITE_URL}/#organization` },
    inLanguage: ["fr-CH", "de-CH", "en"],
  };
}

// ── BreadcrumbList ──────────────────────────────────────────────────────

export interface BreadcrumbItem {
  name: string;
  url: string;
}

export function buildBreadcrumbList(items: BreadcrumbItem[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

// ── BlogPosting ─────────────────────────────────────────────────────────

export function buildBlogPosting(input: {
  headline: string;
  description: string;
  imageUrl: string;
  datePublished: string;
  dateModified?: string;
  categoryName?: string;
  url: string;
  langCode: string;
}) {
  return {
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    image: input.imageUrl,
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    author: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "easyRecharge",
    },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    inLanguage: input.langCode,
    articleSection: input.categoryName,
  };
}

// ── Product (Vehicle) ───────────────────────────────────────────────────

/**
 * Build Product JSON-LD for a vehicle.
 * Returns null when no price is available — Google requires offers,
 * review, or aggregateRating for valid Product rich results.
 */
export function buildVehicleProduct(input: {
  name: string;
  brand: string;
  description: string;
  imageUrl: string;
  url: string;
  priceCHF?: number;
  batteryCapacity?: string;
  rangeKm?: string;
}): Record<string, unknown> | null {
  if (!input.priceCHF) return null;

  const product: Record<string, unknown> = {
    "@type": "Product",
    name: input.name,
    brand: { "@type": "Brand", name: input.brand },
    description: input.description,
    image: input.imageUrl,
    url: input.url,
    offers: {
      "@type": "Offer",
      priceCurrency: "CHF",
      price: input.priceCHF,
      availability: "https://schema.org/InStock",
    },
  };

  const props: Array<{ "@type": string; name: string; value: string }> = [];
  if (input.batteryCapacity) {
    props.push({
      "@type": "PropertyValue",
      name: "Battery Capacity",
      value: input.batteryCapacity,
    });
  }
  if (input.rangeKm) {
    props.push({
      "@type": "PropertyValue",
      name: "Range",
      value: input.rangeKm,
    });
  }
  if (props.length) product.additionalProperty = props;

  return product;
}

// ── FAQPage ─────────────────────────────────────────────────────────────

export function buildFAQPage(
  items: Array<{ question: string; answer: string }>,
) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

// ── Graph wrapper ───────────────────────────────────────────────────────

export function wrapInGraph(...schemas: (Record<string, unknown> | null)[]) {
  return {
    "@context": "https://schema.org",
    "@graph": schemas.filter(Boolean),
  };
}
