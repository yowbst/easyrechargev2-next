import type { CheerioAPI } from "cheerio";

export type JsonLdNode = Record<string, unknown>;

const isNode = (v: unknown): v is JsonLdNode => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Flattens a parsed JSON-LD document into its nodes. The site emits one
 * `{"@context", "@graph": [...]}` block per page, so reading `@type` off the
 * script's top level finds nothing: the nodes live in `@graph`.
 */
export function flattenNodes(doc: unknown): JsonLdNode[] {
  if (Array.isArray(doc)) return doc.flatMap(flattenNodes);
  if (!isNode(doc)) return [];
  if (Array.isArray(doc["@graph"])) return doc["@graph"].flatMap(flattenNodes);
  return [doc];
}

/** Every JSON-LD node on the page; malformed scripts are skipped. */
export function extractJsonLd($: CheerioAPI): JsonLdNode[] {
  const nodes: JsonLdNode[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      nodes.push(...flattenNodes(JSON.parse($(el).html() ?? "")));
    } catch {
      // Invalid JSON-LD is ignored here; a page with none reports "no schema".
    }
  });
  return nodes;
}

/** `@type` is a string or an array of strings. */
export function typesOf(node: JsonLdNode): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

export const hasType = (node: JsonLdNode, ...types: string[]) => typesOf(node).some((t) => types.includes(t));

export const findNode = (nodes: JsonLdNode[], ...types: string[]) => nodes.find((n) => hasType(n, ...types));

/**
 * The author nodes of an article. `author` may be an inline object, an array,
 * or a `{"@id": ...}` reference to another node in the graph.
 */
export function authorsOf(article: JsonLdNode | undefined, nodes: JsonLdNode[]): JsonLdNode[] {
  if (!article) return [];
  const raw = article.author;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list.flatMap((a): JsonLdNode[] => {
    if (!isNode(a)) return [];
    const ref = typeof a["@id"] === "string" ? nodes.find((n) => n["@id"] === a["@id"]) : undefined;
    return [ref ? { ...ref, ...a } : a];
  });
}
