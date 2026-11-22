import { directusFetch } from "@/lib/directus";
import { formatUid } from "@/lib/companies/ingest/normalize";
import { haversineKm } from "@/lib/companies/geo/distance";
import { isSpecialtyKey, type SpecialtyKey } from "@/lib/companies/specialties";

export interface PublicInstaller {
  ehraid: string;
  name: string;
  legalForm: string | null;
  street: string | null;
  postalCode: string | null;
  locality: string | null;
  canton: string | null;
  uid: string;
  lat: number | null;
  lng: number | null;
  isPartner: boolean;
  /** Linked partner id, so a page can drop the company it already shows as the partner card. */
  partnerId: string | null;
  specialties: SpecialtyKey[];
  tradeSummary: string | null;
  /** Last time the register run saw the company (ISO), for the "état au" line. */
  seenAt: string | null;
}

export interface NearbyInstaller extends PublicInstaller {
  distanceKm: number;
}

/** Only what a card shows. No purpose text, no contacts, no person. */
const FIELDS = [
  "ehraid", "legal_name", "display_name", "legal_form_kind", "street_address", "postal_code",
  "locality", "canton", "uid", "lat", "lng", "partner", "specialties", "trade_summary", "register_seen_at",
].join(",");

type Row = Record<string, unknown>;

/**
 * Register street fields often start with a care-of line naming private people
 * ("c/o Enzo et Michèle Di Stefano, Rue de la Mèbre 6"). Public pages show the street only.
 */
export function displayStreet(street: string | null | undefined): string | null {
  if (!street) return null;
  const parts = street
    .split(/\s*,\s*/)
    .filter((p) => p && !/^(c\/o|chez|z\.?\s?hd\.?|p\.?\s?a\.?|presso)\b/i.test(p));
  return parts.length ? parts.join(", ") : null;
}

export function toPublicInstaller(r: Row): PublicInstaller {
  const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
  const specialties = Array.isArray(r.specialties) ? (r.specialties as unknown[]).filter(isSpecialtyKey) : [];
  return {
    ehraid: String(r.ehraid),
    name: String(r.display_name || r.legal_name || ""),
    legalForm: (r.legal_form_kind as string | null) ?? null,
    street: displayStreet(r.street_address as string | null),
    postalCode: (r.postal_code as string | null) ?? null,
    locality: (r.locality as string | null) ?? null,
    canton: (r.canton as string | null) ?? null,
    uid: formatUid(r.uid as string | null),
    lat: num(r.lat),
    lng: num(r.lng),
    isPartner: !!r.partner,
    partnerId: r.partner ? String(typeof r.partner === "object" ? (r.partner as { id?: unknown }).id : r.partner) : null,
    specialties,
    tradeSummary: (r.trade_summary as string | null) || null,
    seenAt: (r.register_seen_at as string | null) || null,
  };
}

const PUBLISHED = (extra: Record<string, string>) => {
  const p = new URLSearchParams({
    fields: FIELDS,
    "filter[status][_eq]": "published",
    "filter[do_not_display][_eq]": "false",
    ...extra,
  });
  return p;
};

/** Published installers inside a square around a point (the selection then measures real distance). */
export async function fetchInstallerCandidates(
  origin: { lat: number; lng: number },
  radiusKm = 25,
  fetcher: typeof directusFetch = directusFetch,
): Promise<PublicInstaller[]> {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((origin.lat * Math.PI) / 180));
  const params = PUBLISHED({
    "filter[lat][_between]": `${(origin.lat - dLat).toFixed(5)},${(origin.lat + dLat).toFixed(5)}`,
    "filter[lng][_between]": `${(origin.lng - dLng).toFixed(5)},${(origin.lng + dLng).toFixed(5)}`,
    limit: "300",
    sort: "ehraid",
  });
  try {
    const res = await fetcher<{ data: Row[] }>(`/items/companies?${params}`, { next: { revalidate: 3600, tags: ["companies"] } });
    return (res?.data ?? []).map(toPublicInstaller);
  } catch (err) {
    console.warn(`[installers] nearby query failed: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

const FORM_RANK: Record<string, number> = { corporation: 0, llc: 0, cooperative: 1, gp: 1, branch: 1, sp: 2 };

/**
 * Up to `max` installers around a point: the first distance tier holding at least `min`
 * wins; partners first, then companies (SA, Sàrl) before sole proprietorships, then
 * distance, then register id so the list stays the same from one refresh to the next.
 */
export function selectNearby(
  candidates: PublicInstaller[],
  origin: { lat: number; lng: number },
  opts: { tiers?: number[]; min?: number; max?: number; excludeIds?: Set<string> } = {},
): NearbyInstaller[] {
  const tiers = opts.tiers ?? [5, 10, 25];
  const min = opts.min ?? 3;
  const max = opts.max ?? 5;
  const measured = candidates
    .filter((c) => c.lat !== null && c.lng !== null && !opts.excludeIds?.has(c.ehraid))
    .map((c) => ({ ...c, distanceKm: haversineKm([origin.lat, origin.lng], [c.lat as number, c.lng as number]) }));
  let pool: NearbyInstaller[] = [];
  for (const t of tiers) {
    pool = measured.filter((c) => c.distanceKm <= t);
    if (pool.length >= min) break;
  }
  return pool
    .sort(
      (a, b) =>
        Number(b.isPartner) - Number(a.isPartner) ||
        (FORM_RANK[a.legalForm ?? ""] ?? 3) - (FORM_RANK[b.legalForm ?? ""] ?? 3) ||
        Math.round(a.distanceKm * 10) - Math.round(b.distanceKm * 10) ||
        a.ehraid.localeCompare(b.ehraid),
    )
    .slice(0, max);
}

export interface CantonInstallerStats {
  count: number;
  topLocalities: { locality: string; postalCode: string | null; count: number }[];
  /** One company per locality among those with the most, companies first: the canton page's list. */
  sample: PublicInstaller[];
  /** Latest register run among the rows (ISO), null without rows. */
  registerDate: string | null;
}

/** Latest `seenAt` of a list: the date the register data on a page dates from. */
export function latestSeen(rows: { seenAt: string | null }[]): string | null {
  let max: string | null = null;
  for (const r of rows) if (r.seenAt && (!max || r.seenAt > max)) max = r.seenAt;
  return max;
}

/** Pure part of the canton stats, so it can be tested without Directus. */
export function summarizeCanton(rows: PublicInstaller[], sampleSize = 12, topSize = 8): CantonInstallerStats {
  const byLocality = new Map<string, PublicInstaller[]>();
  for (const r of rows) {
    const key = r.locality ?? "";
    if (!key) continue;
    byLocality.set(key, [...(byLocality.get(key) ?? []), r]);
  }
  const ranked = [...byLocality.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const pick = (list: PublicInstaller[]) =>
    [...list].sort(
      (a, b) =>
        Number(b.isPartner) - Number(a.isPartner) ||
        (FORM_RANK[a.legalForm ?? ""] ?? 3) - (FORM_RANK[b.legalForm ?? ""] ?? 3) ||
        Number(!!b.tradeSummary) - Number(!!a.tradeSummary) ||
        a.ehraid.localeCompare(b.ehraid),
    )[0];
  return {
    count: rows.length,
    topLocalities: ranked.slice(0, topSize).map(([locality, list]) => ({ locality, postalCode: list[0].postalCode, count: list.length })),
    sample: ranked.slice(0, sampleSize).map(([, list]) => pick(list)),
    registerDate: latestSeen(rows),
  };
}

export async function fetchCantonInstallerStats(
  cantonCode: string,
  fetcher: typeof directusFetch = directusFetch,
): Promise<CantonInstallerStats> {
  const params = PUBLISHED({ "filter[canton][_eq]": cantonCode, limit: "-1", sort: "ehraid" });
  try {
    const res = await fetcher<{ data: Row[] }>(`/items/companies?${params}`, { next: { revalidate: 3600, tags: ["companies"] } });
    return summarizeCanton((res?.data ?? []).map(toPublicInstaller));
  } catch (err) {
    console.warn(`[installers] canton ${cantonCode} stats failed: ${err instanceof Error ? err.message : String(err)}`);
    return { count: 0, topLocalities: [], sample: [], registerDate: null };
  }
}

const LEGAL_WORDS = /^(sa|s\.a\.|ag|sàrl|sarl|s\.à\s?r\.l\.|s\.a\.r\.l\.|gmbh|sagl|s\.?r\.?l\.?|snc|kig|kg|co\.?|cie|&|et|und|e|de|du|des|la|le|les|der|die|das)$/i;

/** Two-letter monogram for a company card: initials of the first two meaningful words. */
export function monogram(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, " ")
    .split(/[\s,.'’-]+/)
    .filter((w) => w && !LEGAL_WORDS.test(w) && /[A-Za-zÀ-ÿ0-9]/.test(w));
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? name;
  const caps = w.match(/[A-ZÀ-Þ]/g);
  if (caps && caps.length >= 2) return (caps[0] + caps[1]).toUpperCase();
  return w.slice(0, 2).toUpperCase();
}

/** Stable tone for a monogram tile, from the register id. */
export function monogramTone(ehraid: string): 0 | 1 | 2 {
  let h = 0;
  for (const ch of ehraid) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 3) as 0 | 1 | 2;
}

/** Published installer count per canton (one grouped query). Missing cantons = 0. */
export async function fetchInstallerCountsByCanton(
  codes: string[],
  fetcher: typeof directusFetch = directusFetch,
): Promise<Record<string, number>> {
  const out: Record<string, number> = Object.fromEntries(codes.map((c) => [c, 0]));
  const params = new URLSearchParams({
    "aggregate[count]": "*",
    "groupBy[]": "canton",
    "filter[status][_eq]": "published",
    "filter[do_not_display][_eq]": "false",
    "filter[canton][_in]": codes.join(","),
  });
  try {
    const res = await fetcher<{ data: { canton: string; count: string | number }[] }>(`/items/companies?${params}`, {
      next: { revalidate: 3600, tags: ["companies"] },
    });
    for (const r of res?.data ?? []) if (r.canton in out) out[r.canton] = Number(r.count) || 0;
  } catch (err) {
    console.warn(`[installers] canton counts failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  return out;
}
