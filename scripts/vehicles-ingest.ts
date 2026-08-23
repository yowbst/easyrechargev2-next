// scripts/vehicles-ingest.ts
// Usage: npm run ingest -- <command> [options]
//
//   scrape                    LIST then DETAILS, merged → data/raw/<date>.json
//   clean   --in <file>       normalize + slug, write data/clean/<date>.json
//   brands  --in <file>       create/update vehicle_brands rows from a cleaned
//                             snapshot (create/update only, never deletes).
//                             Run this BEFORE plan/apply — a genuinely new
//                             manufacturer needs a brand row before its
//                             vehicles can be linked to one; without it they
//                             are created with a null brand relation and the
//                             site silently drops them.
//   plan    --in <file>       diff against CMS, write data/plans/<date>.json (no writes)
//   apply   --plan <file>     execute a plan (the only command besides brands that writes)
//
// Options: --dry-run, --max-change-ratio <n>, --limit <n>, --help
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { directusFetch } from "@/lib/directus";
import {
  triggerCollection,
  pollSnapshot,
  LIST_COLLECTOR,
  DETAILS_COLLECTOR,
} from "@/lib/vehicles/ingest/brightdata";
import { unwrapDetails, mergeListAndDetails } from "@/lib/vehicles/ingest/merge";
import { generateSlug, buildTitle, cleanModel } from "@/lib/vehicles/ingest/clean";
import { fetchAllCmsVehicles, fetchBrandIdBySlug } from "@/lib/vehicles/ingest/queries";
import { buildPlan, assertPlanSane, summarize } from "@/lib/vehicles/ingest/diff";
import { applyPlan } from "@/lib/vehicles/ingest/upsert";
import { deriveBrands, buildBrandPayload } from "@/lib/vehicles/ingest/brands";
import { parseArgs, truncateList, diffBrandFields } from "@/lib/vehicles/ingest/cli-helpers";
import type { ScrapedVehicle, IngestPlan } from "@/lib/vehicles/ingest/types";

const HELP = `
Usage: npm run ingest -- <command> [options]

Commands:
  scrape                    LIST then DETAILS, merged -> data/raw/<date>.json
  clean   --in <file>       normalize + slug, write data/clean/<date>.json
  brands  --in <file>       create/update vehicle_brands rows (run before plan/apply)
  plan    --in <file>       diff against CMS, write data/plans/<date>.json (no writes)
  apply   --plan <file>     execute a plan (the only vehicle-writing command)

Options:
  --dry-run                 brands/apply: print intent, perform zero writes
  --max-change-ratio <n>    plan: override the change-ratio safety ceiling
  --limit <n>                scrape: cap how many DETAILS URLs are fetched
  --help                     print this message

Recommended order: scrape -> clean -> brands -> plan -> apply
`.trim();

const { command, flag, has } = parseArgs(process.argv.slice(2));

const today = new Date().toISOString().slice(0, 10);
const out = (dir: string, file: string) => {
  mkdirSync(`data/${dir}`, { recursive: true });
  return `data/${dir}/${file}`;
};

/** The snapshot files are JSON-lines; plan files are plain JSON. */
function readRows(path: string): ScrapedVehicle[] {
  const text = readFileSync(path, "utf8").trim();
  if (text.startsWith("[")) return JSON.parse(text);
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Prints a count header, up to `max` lines, then a "...and N more" footer. */
function printTruncated(label: string, lines: string[], max = 10) {
  console.log(`  ${label} (${lines.length}):`);
  const { shown, hiddenCount } = truncateList(lines, max);
  for (const line of shown) console.log(`    ${line}`);
  if (hiddenCount) console.log(`    …and ${hiddenCount} more`);
}

/** Bright Data recommends chunking bulk inputs; the notebook used 100. */
const CHUNK = 100;

async function cmdScrape() {
  // ---- Stage 1: LIST — identity and summary specs, one request for the whole catalogue.
  console.log("Stage 1/2 — triggering LIST collector…");
  const listId = await triggerCollection(LIST_COLLECTOR, [
    { range: { min: 0, max: 1200 }, battery: { min: 5, max: 300 }, page_size: 2000 },
  ]);
  console.log(`  snapshot ${listId} — polling`);
  const list = (await pollSnapshot(listId)) as Record<string, unknown>[];
  console.log(`  ${list.length} vehicles listed`);

  const urls = list
    .map((r) => (typeof r.car_url === "string" ? r.car_url : null))
    .filter((u): u is string => Boolean(u));

  const limit = flag("limit") ? Number(flag("limit")) : urls.length;
  const targets = urls.slice(0, limit);
  if (limit < urls.length) console.log(`  --limit ${limit}: scraping a subset`);

  // ---- Stage 2: DETAILS — one input per car_url, chunked.
  console.log(`Stage 2/2 — DETAILS for ${targets.length} vehicles in chunks of ${CHUNK}…`);
  const details: Record<string, unknown>[] = [];

  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    const id = await triggerCollection(DETAILS_COLLECTOR, chunk.map((car_url) => ({ car_url })));
    const rows = await pollSnapshot(id);
    details.push(...unwrapDetails(rows));
    console.log(`  ${Math.min(i + CHUNK, targets.length)}/${targets.length}`);
  }

  // ---- Join. DETAILS has no evdb_id/make/model/year, so this is not optional.
  const { merged, unmatched } = mergeListAndDetails(list, details);
  if (unmatched.length) {
    printTruncated(
      "⚠️  dropped — could not be merged or had no usable make",
      unmatched,
    );
  }

  const path = out("raw", `${today}.json`);
  writeFileSync(path, JSON.stringify(merged, null, 1));
  console.log(`✅ ${merged.length} merged rows → ${path}`);
}

async function cmdClean() {
  const input = flag("in");
  if (!input) throw new Error("clean requires --in <file>");

  const rows = readRows(input);
  const cleaned = rows
    .filter((r) => r.available === true)
    .map((r) => ({
      ...r,
      model: cleanModel(String(r.model ?? ""), String(r.make ?? "")),
      title_v2: buildTitle(r),
      slug: generateSlug(r),
    }));

  const path = out("clean", `${today}.json`);
  writeFileSync(path, JSON.stringify(cleaned, null, 1));
  console.log(`✅ ${cleaned.length} available rows (of ${rows.length}) → ${path}`);

  const brands = deriveBrands(cleaned);
  console.log(`   ${brands.length} distinct brands`);
  console.log(`   next: npm run ingest -- brands --in ${path}`);
}

/** Fetches the fields of a vehicle_brands row that brands actually compares/updates. */
async function fetchBrandRowBySlug(
  slug: string,
): Promise<{ id: string; name: string; active_models: number } | null> {
  const res = await directusFetch<{
    data: Array<{ id: string; name: string; active_models: number | null }>;
  }>(
    `/items/vehicle_brands?filter[slug][_eq]=${encodeURIComponent(slug)}&fields=id,name,active_models&limit=1`,
    { next: { revalidate: 0 } },
  );
  const row = res.data?.[0];
  return row ? { id: row.id, name: row.name, active_models: row.active_models ?? 0 } : null;
}

async function cmdBrands() {
  const input = flag("in");
  if (!input) throw new Error("brands requires --in <file>");
  const dryRun = has("dry-run");

  const rows = readRows(input);
  const brands = deriveBrands(rows);
  console.log(`${dryRun ? "[DRY RUN] " : ""}${brands.length} distinct brands in snapshot`);

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const brand of brands) {
    const existing = await fetchBrandRowBySlug(brand.slug);

    if (!existing) {
      const payload = buildBrandPayload(brand, true);
      console.log(`  CREATE ${brand.slug} (${payload.name}, active_models=${payload.active_models})`);
      if (!dryRun) {
        await directusFetch("/items/vehicle_brands", {
          method: "POST",
          body: JSON.stringify(payload),
          next: { revalidate: 0 },
        });
      }
      created += 1;
      continue;
    }

    const candidate = buildBrandPayload(brand, false);
    const changes = diffBrandFields(existing, candidate);

    if (Object.keys(changes).length === 0) {
      unchanged += 1;
      continue;
    }

    console.log(`  UPDATE ${brand.slug} → ${Object.keys(changes).join(", ")}`);
    if (!dryRun) {
      await directusFetch(`/items/vehicle_brands/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify(changes),
        next: { revalidate: 0 },
      });
    }
    updated += 1;
  }

  console.log(
    `\n${dryRun ? "[DRY RUN] " : ""}✅ brands: created ${created}, updated ${updated}, unchanged ${unchanged}`,
  );
  if (created > 0) {
    console.log(`   New brands are drafts — publish in Directus once verified.`);
  }
  console.log(`   Run "plan"/"apply" only after this — new-brand vehicles need a brand row to link to.`);
}

async function cmdPlan() {
  const input = flag("in");
  if (!input) throw new Error("plan requires --in <file>");

  const scraped = readRows(input);
  console.log(`Reading CMS…`);
  const cms = await fetchAllCmsVehicles();
  console.log(`  ${cms.length} vehicles in CMS, ${scraped.length} in snapshot`);

  // Resolve brand ids once per distinct make, not once per vehicle.
  const brandIds = new Map<string, string>();
  for (const brand of deriveBrands(scraped)) {
    const id = await fetchBrandIdBySlug(brand.slug);
    if (id) brandIds.set(brand.slug, id);
    else console.warn(`  ⚠️  no brand row for "${brand.slug}" — run the brands step first`);
  }

  const plan = buildPlan(scraped, cms, { sourceFile: input, brandIds });
  assertPlanSane(plan, {
    maxChangeRatio: flag("max-change-ratio") ? Number(flag("max-change-ratio")) : undefined,
  });

  const s = summarize(plan);
  console.log(
    "\n  CREATE     %d\n  UPDATE     %d\n  SLUG_DRIFT %d\n  GONE       %d\n  UNCHANGED  %d\n",
    s.CREATE,
    s.UPDATE,
    s.SLUG_DRIFT,
    s.GONE,
    s.UNCHANGED,
  );
  console.log(
    "  (counts are per-entry, not per-vehicle — one vehicle can be both an UPDATE and a SLUG_DRIFT, so totals can exceed the scrape count)\n",
  );

  for (const e of plan.entries.filter((x) => x.bucket === "UPDATE").slice(0, 20)) {
    const fields = Object.keys(e.changes).join(", ");
    console.log(`  UPDATE ${e.slug} → ${fields}`);
  }

  printTruncated(
    "SLUG_DRIFT — most spec revisions drift the generated slug; frozen, reported only",
    plan.entries
      .filter((x) => x.bucket === "SLUG_DRIFT")
      .map((e) => `${e.slug} → ${e.generatedSlug}`),
  );

  printTruncated(
    "GONE — no longer in the scrape; reported only, never unpublished",
    plan.entries.filter((x) => x.bucket === "GONE").map((e) => e.slug),
  );

  const path = out("plans", `${today}.json`);
  writeFileSync(path, JSON.stringify(plan, null, 1));
  console.log(`\n✅ plan → ${path}`);
  console.log(`   review it, then: npm run ingest -- apply --plan ${path}`);
}

async function cmdApply() {
  const planPath = flag("plan");
  if (!planPath) throw new Error("apply requires --plan <file>");

  const plan = JSON.parse(readFileSync(planPath, "utf8")) as IngestPlan;
  const dryRun = has("dry-run");

  console.log(`${dryRun ? "[DRY RUN] " : ""}Applying ${planPath}…`);
  const res = await applyPlan(plan, {
    dryRun,
    onProgress: (e, i, total) => {
      if (i % 25 === 0) console.log(`  ${i}/${total} …`);
    },
  });

  // Persist checkpoints so an interrupted run resumes instead of restarting.
  // Dry runs never mutate `plan.completed`, so there is nothing to persist —
  // and persisting here would just rewrite the file with itself.
  if (!dryRun) writeFileSync(planPath, JSON.stringify(plan, null, 1));

  console.log(`✅ created ${res.created}, updated ${res.updated}, skipped ${res.skipped}`);
  if (res.created > 0) {
    console.log(`   New vehicles are drafts — add thumbnails and publish in Directus.`);
  }
}

const commands: Record<string, () => Promise<void>> = {
  scrape: cmdScrape,
  clean: cmdClean,
  brands: cmdBrands,
  plan: cmdPlan,
  apply: cmdApply,
};

async function main() {
  if (command === "help" || has("help")) {
    console.log(HELP);
    return;
  }

  if (!command) {
    console.error(HELP);
    process.exit(1);
    return;
  }

  const fn = commands[command];
  if (!fn) {
    console.error(`Unknown command "${command}". Expected: ${Object.keys(commands).join(", ")}`);
    process.exit(1);
    return;
  }

  await fn();
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
