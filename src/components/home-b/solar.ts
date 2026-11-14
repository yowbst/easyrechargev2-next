import type { PageRegistryEntry } from "@/lib/directus-queries";
import { opt, optList } from "./content";

const PREFIX = "pages.home.blocks.solar";

/**
 * Tags battery leads that start from this section. `/api/quote` stores the
 * funnel URL's query (from the Referer) as `location_params` on the session
 * and the submission, so these leads are found by `src=home-solar` there.
 */
export const SOLAR_SECTION_SOURCE = "home-solar";

export interface SolarSection {
  eyebrow?: string;
  title: string;
  lede?: string;
  points: string[];
  action?: { label: string; href: string };
  image?: string;
  imageAlt?: string;
  statValue?: string;
  statLabel?: string;
}

/**
 * Solar battery section of the home page — the battery offer's entry point
 * on a charger-first site. Hidden (null) until its title exists in Directus,
 * so the code can ship before the copy.
 */
export function buildSolarSection(
  dictionary: Record<string, string>,
  pageRegistry: PageRegistryEntry[],
  lang: string,
): SolarSection | null {
  const title = opt(dictionary, `${PREFIX}.title`);
  if (!title) return null;

  const points = optList<string>(dictionary, `${PREFIX}.points`, (at) => at("") ?? null, 6);

  const label = opt(dictionary, `${PREFIX}.cta.label`);
  const slug = pageRegistry.find((p) => p.id === "quote-battery")?.slugs[lang];
  const action =
    label && slug ? { label, href: `/${lang}/${slug}?src=${SOLAR_SECTION_SOURCE}` } : undefined;

  const imageId = opt(dictionary, `${PREFIX}.image`);

  return {
    eyebrow: opt(dictionary, `${PREFIX}.eyebrow`),
    title,
    lede: opt(dictionary, `${PREFIX}.lede`),
    points,
    action,
    image: imageId ? `/api/cms/assets/${imageId}` : undefined,
    imageAlt: opt(dictionary, `${PREFIX}.image_alt`),
    statValue: opt(dictionary, `${PREFIX}.stat.value`),
    statLabel: opt(dictionary, `${PREFIX}.stat.label`),
  };
}
