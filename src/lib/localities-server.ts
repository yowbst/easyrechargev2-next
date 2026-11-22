import { directusFetch, DIRECTUS_DEFAULT_LOCALE } from "@/lib/directus";

const LOCALITIES_COLLECTION =
  process.env.DIRECTUS_LOCALITIES_COLLECTION || "localities";

export async function searchLocalitiesDirectus(
  search: string,
  opts: { limit?: number; locale?: string } = {},
): Promise<{ data: unknown[]; meta?: { note: string } }> {
  const trimmed = search.trim();
  if (trimmed.length < 2) return { data: [], meta: { note: "search too short" } };

  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 50);
  const locale = opts.locale || DIRECTUS_DEFAULT_LOCALE;

  const params = new URLSearchParams();
  params.set(
    "fields",
    "id,name,postal_code,additional_digit,language,canton_2l,canton.*,canton.translations.name",
  );
  params.set("filter[_or][0][name][_icontains]", trimmed);
  params.set("filter[_or][1][postal_code][_icontains]", trimmed);
  params.set(
    "deep[canton][translations][_filter][languages_code][_eq]",
    locale,
  );
  params.set("sort", "name,postal_code");
  params.set("limit", String(limit));

  const data = await directusFetch<{ data: unknown[] }>(
    `/items/${LOCALITIES_COLLECTION}?${params.toString()}`,
    { next: { revalidate: 86400 } },
  );

  return data;
}

export async function hasChargingSubsidy(localityId: string): Promise<boolean> {
  // Don't filter by locale — subsidies exist regardless of language
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await directusFetch<{ data: any }>(
    `/items/localities/${localityId}?fields=translations.subsidies`,
    { next: { revalidate: 3600 } },
  );

  const translations = data?.data?.translations || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return translations.some((t: any) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (t.subsidies || []).some((s: any) =>
      s.category === "charging-infrastructure" && s.audiences?.includes("personal"),
    ),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SubsidyTranslation = { subsidies?: any[] | null };

/**
 * Personal charging-infrastructure subsidies of a locality, reduced to what
 * the quote funnel shows: whether one exists and the highest CHF amount any
 * of them names (null when none states an amount — most do not).
 */
export function summarizeChargingSubsidies(translations: SubsidyTranslation[]): { available: boolean; maxChf: number | null } {
  let available = false;
  let max = 0;
  for (const t of translations) {
    for (const s of t.subsidies ?? []) {
      if (s?.category !== "charging-infrastructure" || !s.audiences?.includes("personal")) continue;
      available = true;
      for (const a of s.amounts ?? []) {
        for (const v of a?.chf ?? []) if (typeof v === "number" && v > max) max = v;
      }
    }
  }
  return { available, maxChf: max > 0 ? max : null };
}

/** Subsidy summary by postal code and locality name, as the mini-quote hands them over. */
export async function chargingSubsidySummary(postalCode: string, locality: string) {
  const params = new URLSearchParams();
  params.set("fields", "name,translations.subsidies");
  params.set("filter[postal_code][_eq]", postalCode);
  params.set("limit", "10");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await directusFetch<{ data: any[] }>(`/items/${LOCALITIES_COLLECTION}?${params.toString()}`, { next: { revalidate: 3600 } });
  const rows = res?.data ?? [];
  const wanted = locality.trim().toLowerCase();
  const row = rows.find((r) => String(r.name ?? "").toLowerCase() === wanted) ?? (rows.length === 1 ? rows[0] : null);
  if (!row) return null;
  return { locality: String(row.name), ...summarizeChargingSubsidies(row.translations ?? []) };
}

// ── Canton-wide subsidy summary (canton installation pages) ─────────────

export interface CantonSubsidyProgram {
  sourceId: number | string;
  name: string;
  contributor: string | null;
  siteUrl: string | null;
  amounts: string[];
  /** Who it is for, as the program states it (first sentences, <= 260 chars). */
  conditions: string | null;
  /** Localities whose subsidy list carries this program. */
  localities: number;
}

export interface CantonSubsidySummary {
  /** Localities read (test rows excluded). */
  total: number;
  /** Localities with at least one personal charging-infrastructure subsidy. */
  withSubsidy: number;
  /** Highest CHF amount any of those subsidies names, null when none does. */
  maxChf: number | null;
  /** Programs covering at least half the localities, most widespread first (max 3). */
  widePrograms: CantonSubsidyProgram[];
  /** Latest subsidy sync among the rows (ISO, as stored). */
  fetchedAt: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CantonLocalityRow = { name?: string | null; postal_code?: string | null; subsidies_fetched_at?: string | null; translations?: SubsidyTranslation[] | null; [k: string]: any };

/** Whole sentences up to `max` characters (the first sentence alone if it is longer). */
export function clipSentences(text: unknown, max: number): string | null {
  if (typeof text !== "string") return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const sentences = clean.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [clean];
  let out = "";
  for (const sentence of sentences) {
    if (out && (out + sentence).trim().length > max) break;
    out += sentence;
  }
  return out.trim();
}

const isTestLocality = (r: CantonLocalityRow) => r.postal_code === "9999" || /^test\b/i.test(String(r.name ?? ""));

/** Pure aggregation, testable without Directus. */
export function summarizeCantonSubsidies(rows: CantonLocalityRow[]): CantonSubsidySummary {
  const real = rows.filter((r) => !isTestLocality(r));
  let withSubsidy = 0;
  let max = 0;
  let fetchedAt: string | null = null;
  const programs = new Map<string, CantonSubsidyProgram>();
  for (const r of real) {
    if (r.subsidies_fetched_at && (!fetchedAt || r.subsidies_fetched_at > fetchedAt)) fetchedAt = r.subsidies_fetched_at;
    const seen = new Set<string>();
    let has = false;
    for (const t of r.translations ?? []) {
      for (const s of t.subsidies ?? []) {
        if (s?.category !== "charging-infrastructure" || !s.audiences?.includes("personal")) continue;
        has = true;
        for (const a of s.amounts ?? []) for (const v of a?.chf ?? []) if (typeof v === "number" && v > max) max = v;
        const key = String(s.source_id ?? s.name);
        if (seen.has(key)) continue;
        seen.add(key);
        const p = programs.get(key) ?? {
          sourceId: s.source_id ?? key,
          name: String(s.name ?? ""),
          contributor: s.contributor?.name ?? null,
          siteUrl: s.site_url ?? null,
          amounts: (s.amounts ?? []).map((a: { text?: string }) => a?.text).filter(Boolean),
          conditions: clipSentences(s.description, 260),
          localities: 0,
        };
        p.localities += 1;
        programs.set(key, p);
      }
    }
    if (has) withSubsidy += 1;
  }
  const widePrograms = [...programs.values()]
    .filter((p) => real.length > 0 && p.localities >= real.length / 2)
    .sort((a, b) => b.localities - a.localities || a.name.localeCompare(b.name))
    .slice(0, 3);
  return { total: real.length, withSubsidy, maxChf: max > 0 ? max : null, widePrograms, fetchedAt };
}

/**
 * Subsidy summary over every locality of a canton (French texts). Read in pages of 100:
 * a whole canton is about 3 MB, over the 2 MB fetch cache limit; a page stays well under.
 */
export async function fetchCantonSubsidySummary(cantonCode: string): Promise<CantonSubsidySummary | null> {
  const rows: CantonLocalityRow[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const params = new URLSearchParams({
        fields: "name,postal_code,subsidies_fetched_at,translations.subsidies",
        "filter[canton_2l][_eq]": cantonCode,
        "deep[translations][_filter][languages_code][_eq]": "fr-FR",
        sort: "postal_code,name",
        limit: "100",
        page: String(page),
      });
      const res = await directusFetch<{ data: CantonLocalityRow[] }>(`/items/${LOCALITIES_COLLECTION}?${params}`, {
        next: { revalidate: 3600, tags: ["localities"] },
      });
      const data = res?.data ?? [];
      rows.push(...data);
      if (data.length < 100) break;
    }
  } catch (err) {
    console.warn(`[localities] canton ${cantonCode} subsidy summary failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  return rows.length ? summarizeCantonSubsidies(rows) : null;
}

/**
 * Locality page slugs for a list of locality names in one canton (register locality
 * names match the locality names). A name with several postcodes (Lausanne) maps to its
 * lowest postcode. Keys are lower-cased names; names without a match are absent.
 */
export async function fetchLocalitySlugsByName(cantonCode: string, names: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(names.filter(Boolean))];
  if (unique.length === 0) return {};
  const filter = { _and: [{ canton_2l: { _eq: cantonCode } }, { name: { _in: unique } }, { slug: { _nnull: true } }] };
  const params = new URLSearchParams({ fields: "name,postal_code,slug", filter: JSON.stringify(filter), sort: "postal_code", limit: "500" });
  try {
    const res = await directusFetch<{ data: { name: string; postal_code: string; slug: string }[] }>(
      `/items/${LOCALITIES_COLLECTION}?${params}`,
      { next: { revalidate: 3600, tags: ["localities"] } },
    );
    const out: Record<string, string> = {};
    for (const r of res?.data ?? []) {
      const key = String(r.name).toLowerCase();
      if (!out[key] && r.slug) out[key] = r.slug;
    }
    return out;
  } catch (err) {
    console.warn(`[localities] slug lookup failed: ${err instanceof Error ? err.message : String(err)}`);
    return {};
  }
}
