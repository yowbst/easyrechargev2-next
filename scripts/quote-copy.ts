/**
 * Quote funnel v2 strings → Directus.
 *
 *   npm run quote-copy -- plan    Show the keys missing from the charger quote page (read-only)
 *   npm run quote-copy -- apply   Back up, then add the missing keys (writes!)
 *
 * Source: src/components/quote-shell/copy.ts. Only MISSING keys are added — a
 * key already translated in Directus is never overwritten, so editors keep the
 * last word. The whole `content` object is sent back (a JSON PATCH replaces
 * the field). Backups go to .backups/quote-copy/ (gitignored).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SHELL_COPY } from "../src/components/quote-shell/copy";

const ROUTE_ID = "quote";
const LOCALES = { fr: "fr-FR", de: "de-DE" } as const;
const BACKUPS = join(__dirname, "..", ".backups", "quote-copy");

type Json = Record<string, unknown>;
interface Row { id: number; languages_code: string; content: Json | null }

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing (.env.local)`);
  return v;
};

async function directus(path: string, init: RequestInit = {}, token = env("DIRECTUS_STATIC_TOKEN")) {
  const res = await fetch(`${env("DIRECTUS_URL")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Directus ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchRows(): Promise<Row[]> {
  const q = `/items/pages?filter[route_id][_eq]=${ROUTE_ID}&fields=translations.id,translations.languages_code,translations.content`;
  const pages = (await directus(q)).data as { translations: Row[] }[];
  if (pages.length !== 1) throw new Error(`expected one "${ROUTE_ID}" page, got ${pages.length}`);
  return pages[0].translations;
}

/** Adds `value` at the dotted `key` unless something is there; reports a clash with a string on the way. */
function addMissing(content: Json, key: string, value: string): "added" | "exists" | "conflict" {
  const parts = key.split(".");
  let node: Json = content;
  for (const part of parts.slice(0, -1)) {
    const next = node[part];
    if (next === undefined) node[part] = {};
    else if (typeof next !== "object" || next === null || Array.isArray(next)) return "conflict";
    node = node[part] as Json;
  }
  const leaf = parts[parts.length - 1];
  if (node[leaf] !== undefined) return "exists";
  node[leaf] = value;
  return "added";
}

async function main() {
  const mode = process.argv[2] ?? "plan";
  if (mode !== "plan" && mode !== "apply") throw new Error("usage: quote-copy plan|apply");
  const rows = await fetchRows();

  for (const [lang, locale] of Object.entries(LOCALES) as [keyof typeof LOCALES, string][]) {
    const row = rows.find((r) => r.languages_code === locale);
    if (!row) throw new Error(`no ${locale} translation on the "${ROUTE_ID}" page`);
    const before = JSON.parse(JSON.stringify(row.content ?? {})) as Json;
    const merged = JSON.parse(JSON.stringify(before)) as Json;
    const added: string[] = [];
    const conflicts: string[] = [];
    for (const [key, value] of Object.entries(SHELL_COPY[lang])) {
      const r = addMissing(merged, key, value);
      if (r === "added") added.push(key);
      if (r === "conflict") conflicts.push(key);
    }
    console.log(`\n${locale} (pages_translations ${row.id}): ${added.length} to add, ${conflicts.length} conflicts`);
    for (const k of added) console.log(`  + ${k}`);
    for (const k of conflicts) console.log(`  ! ${k} (a parent key holds text)`);
    if (mode === "plan" || added.length === 0) continue;

    mkdirSync(BACKUPS, { recursive: true });
    const file = join(BACKUPS, `${new Date().toISOString().replace(/[:.]/g, "-")}-${row.id}-${locale}.json`);
    writeFileSync(file, JSON.stringify(before, null, 2));
    await directus(`/items/pages_translations/${row.id}`, { method: "PATCH", body: JSON.stringify({ content: merged }) }, env("DIRECTUS_ADMIN_TOKEN"));
    console.log(`  backup ${file}\n  written`);
  }

  if (mode === "apply") {
    // Read back: every key now present, nothing that existed has changed.
    const after = await fetchRows();
    for (const [lang, locale] of Object.entries(LOCALES) as [keyof typeof LOCALES, string][]) {
      const content = (after.find((r) => r.languages_code === locale)?.content ?? {}) as Json;
      const missing = Object.keys(SHELL_COPY[lang]).filter((k) => addMissing(JSON.parse(JSON.stringify(content)), k, "") === "added");
      console.log(`${locale}: ${missing.length ? `STILL MISSING ${missing.join(", ")}` : "all keys present"}`);
    }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
