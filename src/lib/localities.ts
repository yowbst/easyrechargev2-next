export interface LocalityResponse {
  id: string;
  postalCode: string;
  locality: string;
  canton: string;
}

export async function searchLocalities(
  term: string,
  limit = 5,
  signal?: AbortSignal,
  locale?: string,
): Promise<LocalityResponse[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const url =
    `/api/cms/localities?search=${encodeURIComponent(q)}&limit=${encodeURIComponent(String(limit))}` +
    (locale ? `&locale=${encodeURIComponent(locale)}` : "");

  const res = await fetch(url, { signal });
  if (!res.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as { data?: any[] };
  const rows = json?.data || [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return rows.map((r: any) => {
    const canton = r.canton;
    const cantonLabel =
      canton?.translations?.[0]?.name ??
      (typeof r.canton_2l === "string" ? r.canton_2l : undefined) ??
      (typeof canton?.code === "string" ? canton.code : undefined) ??
      "";

    return {
      id: String(r.id ?? ""),
      postalCode: String(r.postal_code ?? ""),
      locality: String(r.name ?? ""),
      canton: String(cantonLabel),
    };
  });
}
