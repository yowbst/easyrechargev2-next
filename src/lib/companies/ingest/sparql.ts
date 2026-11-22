import { CANDIDATE_PATTERN, sparqlStringLiteral } from "./candidates";
import type { RawCompany } from "./types";

export const LINDAS_ENDPOINT = "https://ld.admin.ch/query";
export const ZEFIX_GRAPH = "https://lindas.admin.ch/foj/zefix";
export const PAGE_SIZE = 2000;

export const CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE",
  "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH",
] as const;

/** One page of candidate companies for one canton. */
export function buildCantonQuery(canton: string, offset: number, limit = PAGE_SIZE): string {
  if (!/^[A-Z]{2}$/.test(canton)) throw new Error(`Invalid canton code "${canton}"`);
  return `PREFIX schema: <http://schema.org/>
SELECT ?s ?legalName ?purpose ?form ?street ?plz ?locality ?region ?muni ?uid ?chid WHERE {
  GRAPH <${ZEFIX_GRAPH}> {
    ?s schema:legalName ?legalName ;
       schema:description ?purpose ;
       schema:additionalType ?form ;
       schema:address ?a ;
       <https://schema.ld.admin.ch/municipality> ?muni .
    ?a schema:addressRegion ?region ;
       schema:addressLocality ?locality .
    OPTIONAL { ?a schema:postalCode ?plz }
    OPTIONAL { ?a schema:streetAddress ?street }
    OPTIONAL { ?s schema:identifier ?u . ?u schema:name "CompanyUID" ; schema:value ?uid }
    OPTIONAL { ?s schema:identifier ?c . ?c schema:name "CompanyCHID" ; schema:value ?chid }
    FILTER(?region = ${sparqlStringLiteral(canton)})
    FILTER(REGEX(STR(?purpose), ${sparqlStringLiteral(CANDIDATE_PATTERN)}, "i"))
  }
}
ORDER BY ?s
LIMIT ${limit} OFFSET ${offset}`;
}

/**
 * Companies by UID, whatever their purpose says: used to make sure every active partner
 * has a row even when its purpose fails the installer pattern.
 */
export function buildUidQuery(uids: string[]): string {
  const clean = uids.filter((u) => /^CHE\d{9}$/.test(u));
  if (clean.length === 0) throw new Error("buildUidQuery: no valid UID");
  return `PREFIX schema: <http://schema.org/>
SELECT ?s ?legalName ?purpose ?form ?street ?plz ?locality ?region ?muni ?uid ?chid WHERE {
  GRAPH <${ZEFIX_GRAPH}> {
    ?s schema:identifier ?u . ?u schema:name "CompanyUID" ; schema:value ?uid .
    VALUES ?uid { ${clean.map(sparqlStringLiteral).join(" ")} }
    ?s schema:legalName ?legalName ;
       schema:description ?purpose ;
       schema:additionalType ?form ;
       schema:address ?a ;
       <https://schema.ld.admin.ch/municipality> ?muni .
    ?a schema:addressRegion ?region ;
       schema:addressLocality ?locality .
    OPTIONAL { ?a schema:postalCode ?plz }
    OPTIONAL { ?a schema:streetAddress ?street }
    OPTIONAL { ?s schema:identifier ?c . ?c schema:name "CompanyCHID" ; schema:value ?chid }
  }
}
ORDER BY ?s`;
}

export async function fetchByUids(uids: string[], sparql: SparqlFetch = lindasFetch): Promise<RawCompany[]> {
  if (uids.length === 0) return [];
  const res = await sparql(buildUidQuery(uids));
  return parseBindings(res.results.bindings).map((c) => ({ ...c, forcedPartner: true }));
}

export interface SparqlBinding {
  [variable: string]: { type: string; value: string } | undefined;
}
export interface SparqlResponse {
  results: { bindings: SparqlBinding[] };
}

/** Injectable so tests never touch the network. */
export type SparqlFetch = (query: string) => Promise<SparqlResponse>;

export const lindasFetch: SparqlFetch = async (query) => {
  const res = await fetch(LINDAS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/sparql-results+json",
    },
    body: new URLSearchParams({ query }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`LINDAS ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as SparqlResponse;
};

const tail = (uri: string | undefined) => (uri ? uri.replace(/\/+$/, "").split("/").pop() ?? null : null);

/**
 * Bindings -> companies, one per ehraid. A company can come back twice when the
 * graph holds two addresses or two descriptions for it; the first row wins and
 * the order is stable because the query sorts by subject.
 */
export function parseBindings(bindings: SparqlBinding[]): RawCompany[] {
  const seen = new Map<string, RawCompany>();
  for (const b of bindings) {
    const ehraid = tail(b.s?.value);
    const legalName = b.legalName?.value;
    const canton = b.region?.value;
    if (!ehraid || !legalName || !canton || !b.purpose?.value) continue;
    if (seen.has(ehraid)) continue;
    const bfs = Number(tail(b.muni?.value));
    seen.set(ehraid, {
      ehraid,
      uid: b.uid?.value ?? null,
      chid: b.chid?.value ?? null,
      legalName,
      purpose: b.purpose.value,
      legalFormCode: tail(b.form?.value),
      street: b.street?.value ?? null,
      postalCode: b.plz?.value ?? null,
      locality: b.locality?.value ?? null,
      canton,
      bfsId: Number.isFinite(bfs) && bfs > 0 ? bfs : null,
    });
  }
  return [...seen.values()];
}

/** Pages through one canton until a short page comes back. */
export async function fetchCanton(
  canton: string,
  sparql: SparqlFetch = lindasFetch,
  opts: { pageSize?: number; onPage?: (n: number) => void } = {},
): Promise<RawCompany[]> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const all = new Map<string, RawCompany>();
  for (let offset = 0; ; offset += pageSize) {
    const res = await sparql(buildCantonQuery(canton, offset, pageSize));
    const rows = res.results.bindings;
    for (const c of parseBindings(rows)) all.set(c.ehraid, c);
    opts.onPage?.(rows.length);
    if (rows.length < pageSize) break;
  }
  return [...all.values()];
}
