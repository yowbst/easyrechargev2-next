// scripts/build-slug-fixture.ts
// One-shot. Joins the December scrape snapshot to live CMS slugs by evdb_id.
// Run: npx tsx --env-file=.env.local scripts/build-slug-fixture.ts <path-to-cleaned.json>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const SRC = process.argv[2];
if (!SRC) throw new Error("usage: build-slug-fixture.ts <cleaned.json>");

const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;
if (!url || !token) throw new Error("DIRECTUS_URL and DIRECTUS_STATIC_TOKEN required");

// Wrapped in an async IIFE (rather than top-level await) because this package
// has no "type": "module" and tsx transforms plain .ts scripts to CJS, which
// esbuild rejects for top-level await.
async function main() {
  const res = await fetch(`${url}/items/vehicles?fields=evdb_id,slug&limit=1000`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Directus ${res.status}`);
  const live = (await res.json()).data as Array<{ evdb_id: string; slug: string }>;
  const bySlugId = new Map(live.map((v) => [String(v.evdb_id), v.slug]));

  // The cleaned snapshot is JSON-lines (pandas orient=records, lines=True)
  const rows = readFileSync(SRC, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const fixture = rows
    .filter((r) => bySlugId.has(String(r.evdb_id)))
    .map((r) => ({
      evdb_id: r.evdb_id,
      make: r.make,
      model: r.model,
      year: r.year,
      battery_details: { nominal_capacity: r.battery_details?.nominal_capacity ?? null },
      range: r.range,
      liveSlug: bySlugId.get(String(r.evdb_id)),
    }));

  mkdirSync("src/lib/vehicles/ingest/__fixtures__", { recursive: true });
  writeFileSync(
    "src/lib/vehicles/ingest/__fixtures__/live-slugs.json",
    JSON.stringify(fixture, null, 1),
  );
  console.log(`wrote ${fixture.length} rows (live CMS has ${live.length})`);
}

main();
