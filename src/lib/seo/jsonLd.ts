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
