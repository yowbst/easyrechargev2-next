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
