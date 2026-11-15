/**
 * JSON-LD structured data builders.
 * Pure functions — copied from server/seo/jsonLd.ts.
 */

const SITE_URL = process.env.SITE_URL || "https://easyrecharge.ch";

// ── Organization ────────────────────────────────────────────────────────

/** `site_settings.global_config.organization` — every field optional. */
export interface OrganizationConfig {
  legal_name?: string;
  /** Swiss business identifier, e.g. CHE-123.456.789. */
  uid?: string;
  telephone?: string;
  email?: string;
  founding_date?: string;
  address?: {
    street?: string;
    postal_code?: string;
    locality?: string;
    region?: string;
  };
  same_as?: string[];
}

/**
 * Profile URLs for `sameAs`. Footer socials are included only when they point
 * at a real profile: the CMS ships bare placeholders ("https://x.com") that
 * would tell crawlers our entity is the platform itself.
 */
export function resolveSameAs(
  config: OrganizationConfig | null | undefined,
  socials: Array<{ url?: string | null }> | null | undefined,
): string[] {
  const urls = [...(config?.same_as ?? []), ...(socials ?? []).map((s) => s.url ?? "")];
  const profiles = urls.filter((raw) => {
    try {
      const u = new URL(raw);
      return u.pathname.replace(/\/+$/, "") !== "";
    } catch {
      return false;
    }
  });
  return [...new Set(profiles)];
}

export function buildOrganization(input: {
  logoUrl: string;
  organization?: OrganizationConfig | null;
  sameAs?: string[];
}) {
  const org = input.organization ?? {};
  const a = org.address;
  const hasAddress = !!(a && (a.street || a.postal_code || a.locality));
  return {
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "easyRecharge",
    ...(org.legal_name && { legalName: org.legal_name }),
    url: SITE_URL,
    logo: input.logoUrl,
    areaServed: { "@type": "Country", name: "CH" },
    ...(org.uid && { identifier: org.uid }),
    ...(org.founding_date && { foundingDate: org.founding_date }),
    ...(org.email && { email: org.email }),
    ...(org.telephone && { telephone: org.telephone }),
    ...(hasAddress && {
      address: {
        "@type": "PostalAddress",
        ...(a?.street && { streetAddress: a.street }),
        ...(a?.postal_code && { postalCode: a.postal_code }),
        ...(a?.locality && { addressLocality: a.locality }),
        ...(a?.region && { addressRegion: a.region }),
        addressCountry: "CH",
      },
    }),
    ...(org.telephone && {
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer service",
        telephone: org.telephone,
        areaServed: "CH",
        availableLanguage: ["fr", "de"],
      },
    }),
    sameAs: input.sameAs ?? [],
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
  authorName?: string | null;
}) {
  return {
    "@type": "BlogPosting",
    headline: input.headline,
    description: input.description,
    image: input.imageUrl,
    datePublished: input.datePublished,
    dateModified: input.dateModified || input.datePublished,
    // Author: the post's real author when set in Directus, easyRecharge
    // otherwise. Publisher is inlined in full (not just an @id reference):
    // the #organization node only exists on the homepage graph, and
    // Google's Rich Results Test does not resolve @ids across pages — a
    // bare reference reads as an Article with no publisher/logo.
    author: input.authorName
      ? { "@type": "Person", name: input.authorName, url: SITE_URL }
      : {
          "@type": "Organization",
          "@id": `${SITE_URL}/#organization`,
          name: "easyRecharge",
          url: SITE_URL,
        },
    publisher: {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "easyRecharge",
      url: SITE_URL,
      logo: `${SITE_URL}/og-default.webp`,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
    inLanguage: input.langCode,
    articleSection: input.categoryName,
  };
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

// ── Car (Vehicle) ──────────────────────────────────────────────────────

/**
 * Build Car JSON-LD for a vehicle page.
 * Uses @type "Car" (schema.org/Car extends Vehicle).
 * No offers/price — easyRecharge provides charging info, not vehicle sales.
 */
export function buildVehicleCar(input: {
  name: string;
  brand: string;
  description: string;
  imageUrl: string;
  url: string;
  vehicleConfiguration?: string;
  properties?: {
    batteryCapacity?: string;
    range?: string;
    acChargingPower?: string;
    dcMaxChargingPower?: string;
    chargePort?: string;
    efficiency?: string;
  };
}): Record<string, unknown> {
  const car: Record<string, unknown> = {
    "@type": "Car",
    name: input.name,
    brand: { "@type": "Brand", name: input.brand },
    description: input.description,
    image: input.imageUrl,
    url: input.url,
    fuelType: "https://schema.org/ElectricFuel",
  };

  if (input.vehicleConfiguration) {
    car.vehicleConfiguration = input.vehicleConfiguration;
  }

  const props: Array<{ "@type": string; name: string; value: string }> = [];
  const p = input.properties;
  if (p?.batteryCapacity) {
    props.push({ "@type": "PropertyValue", name: "Battery Capacity", value: p.batteryCapacity });
  }
  if (p?.range) {
    props.push({ "@type": "PropertyValue", name: "Range", value: p.range });
  }
  if (p?.acChargingPower) {
    props.push({ "@type": "PropertyValue", name: "AC Charging Power", value: p.acChargingPower });
  }
  if (p?.dcMaxChargingPower) {
    props.push({ "@type": "PropertyValue", name: "DC Max Charging Power", value: p.dcMaxChargingPower });
  }
  if (p?.chargePort) {
    props.push({ "@type": "PropertyValue", name: "Charge Port", value: p.chargePort });
  }
  if (p?.efficiency) {
    props.push({ "@type": "PropertyValue", name: "Efficiency", value: p.efficiency });
  }
  if (props.length) car.additionalProperty = props;

  return car;
}

// ── GovernmentService (subsidies) ──────────────────────────────────────

export function buildGovernmentService(input: {
  name: string;
  description: string;
  providerName: string;
  areaServed: { name: string; postalCode: string };
  url?: string;
}): Record<string, unknown> {
  const service: Record<string, unknown> = {
    "@type": "GovernmentService",
    name: input.name,
    description: input.description,
    serviceType: "Subsidy",
    provider: {
      "@type": "GovernmentOrganization",
      name: input.providerName,
    },
    areaServed: {
      "@type": "City",
      name: input.areaServed.name,
      postalCode: input.areaServed.postalCode,
    },
  };
  if (input.url) service.url = input.url;
  return service;
}

// ── Graph wrapper ───────────────────────────────────────────────────────

export function wrapInGraph(...schemas: (Record<string, unknown> | null)[]) {
  return {
    "@context": "https://schema.org",
    "@graph": schemas.filter(Boolean),
  };
}
