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
//   images                    download 1536px thumbnails through the Bright Data proxy
//
// Options: --dry-run, --max-change-ratio <n>, --limit <n>, --help
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Blob } from "node:buffer";
import { fetch as undiciFetch, FormData } from "undici";
import { directusFetch, DIRECTUS_URL } from "@/lib/directus";
import {
  triggerCollection,
  pollSnapshot,
  LIST_COLLECTOR,
  DETAILS_COLLECTOR,
} from "@/lib/vehicles/ingest/brightdata";
import {
  unwrapDetails,
  mergeListAndDetails,
  classifyAvailability,
} from "@/lib/vehicles/ingest/merge";
import { generateSlug, buildTitle, cleanModel } from "@/lib/vehicles/ingest/clean";
import {
  fetchAllCmsVehicles,
  fetchBrandIdBySlug,
  fetchBrandRowBySlug,
  fetchVehiclesForThumbnails,
} from "@/lib/vehicles/ingest/queries";
import { buildPlan, assertPlanSane, summarize } from "@/lib/vehicles/ingest/diff";
import { applyPlanAndPersist } from "@/lib/vehicles/ingest/upsert";
import { deriveBrands, buildBrandPayload } from "@/lib/vehicles/ingest/brands";
import {
  upgradeThumbnails,
  assertJpegBytes,
  type ThumbnailSeams,
} from "@/lib/vehicles/ingest/images";
import { readProxyConfig, createDispatcher } from "@/lib/vehicles/ingest/proxy";
import {
  parseArgs,
  truncateList,
  diffBrandFields,
  validateFlags,
  parseMaxChangeRatio,
  parseLimit,
  partitionUnmatched,
  pickScrapeTargets,
} from "@/lib/vehicles/ingest/cli-helpers";
import type { ScrapedVehicle, IngestPlan } from "@/lib/vehicles/ingest/types";

const HELP = `
Usage: npm run ingest -- <command> [options]

Commands:
  scrape                    LIST then DETAILS, merged -> data/raw/<date>.json
  clean   --in <file>       normalize + slug, write data/clean/<date>.json
  brands  --in <file>       create/update vehicle_brands rows (run before plan/apply)
  plan    --in <file>       diff against CMS, write data/plans/<date>.json (no writes)
  apply   --plan <file>     execute a plan (the only vehicle-writing command)
  images                    download 1536px thumbnails through the Bright Data proxy

Options:
  --dry-run                 brands/apply/images: print intent, perform zero writes
  --max-change-ratio <n>    plan: override the change-ratio safety ceiling
  --partial                 plan: this snapshot is knowingly a subset — disables the
                             scrape-size floor (the change-ratio guard stays active)
  --limit <n>                scrape: cap how many DETAILS URLs are fetched;
                             images: cap how many thumbnails are attempted
  --only <file>              scrape: target these car_urls (one per line), ignoring
                             availability — used to repair discontinued records
  --include-unavailable      clean: keep discontinued vehicles instead of dropping them
  --status <draft|published> images: restrict to one half of the catalogue
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

/** The vehicles folder the existing 562 thumbnails already live in. */
const VEHICLES_FOLDER_ID = "8d8adba5-b056-49f9-9882-e12c8c6efb55";

async function cmdScrape() {
  // ---- Stage 1: LIST — identity and summary specs, one request for the whole catalogue.
  console.log("Stage 1/2 — triggering LIST collector…");
  const listId = await triggerCollection(LIST_COLLECTOR, [
    { range: { min: 0, max: 1200 }, battery: { min: 5, max: 300 }, page_size: 2000 },
  ]);
  console.log(`  snapshot ${listId} — polling`);
  const list = (await pollSnapshot(listId)) as Record<string, unknown>[];
  console.log(`  ${list.length} vehicles listed`);

  // Only "Available to order" vehicles are ever ingested — `clean` drops the
  // rest — so running DETAILS over discontinued models is pure cost. The LIST
  // collector returns the whole historical catalogue: the first live run
  // returned 1,405 rows of which 645 were available, so filtering here avoids
  // ~760 billable page scrapes per refresh.
  // --only <file> targets an explicit set of car_urls, one per line, and
  // ignores availability. That is the only way to reach a discontinued
  // vehicle: it is absent from every normal run, so its record in the CMS
  // freezes at whatever it held when it was last on sale.
  const onlyFile = flag("only");
  const onlyUrls = onlyFile
    ? new Set(readFileSync(onlyFile, "utf8").split("\n").map((l) => l.trim()).filter(Boolean))
    : undefined;

  const available = pickScrapeTargets(
    list,
    (r) => classifyAvailability(r.availability) === true,
    onlyUrls,
  );

  if (onlyUrls) {
    console.log(
      `  --only ${onlyFile}: ${available.length} of ${onlyUrls.size} requested urls found ` +
        `in the listing (availability ignored)`,
    );
  } else {
    console.log(
      `  ${available.length} available to order (of ${list.length} listed) — ` +
        `DETAILS runs for the available ones only`,
    );
  }

  const urls = available
    .map((r) => (typeof r.car_url === "string" ? r.car_url : null))
    .filter((u): u is string => Boolean(u));

  const limit = parseLimit(flag("limit")) ?? urls.length;
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
  // Join against the AVAILABLE subset, not the full list — otherwise every
  // discontinued row would land in `unmatched` as a spurious drop warning.
  const { merged, unmatched } = mergeListAndDetails(available, details);

  // Separate "we never asked for it" from "we asked and it failed". Under
  // --limit almost every unmatched row is the former, and lumping them
  // together reads like a mass failure when nothing is wrong.
  const { skippedByLimit, unresolved } = partitionUnmatched(unmatched, targets);

  if (skippedByLimit.length) {
    console.log(
      `  ℹ️  ${skippedByLimit.length} available vehicles not scraped — excluded by ` +
        `--limit ${limit}. Expected, not a data problem.`,
    );
  }
  if (unresolved.length) {
    printTruncated(
      "⚠️  dropped — scraped but no DETAILS match, or no usable make",
      unresolved,
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
  // Repairing a discontinued vehicle requires keeping it: its `available` is
  // false by definition, and the default filter would drop it here.
  const keepUnavailable = has("include-unavailable");
  const cleaned = rows
    .filter((r) => keepUnavailable || r.available === true)
    .map((r) => ({
      ...r,
      model: cleanModel(String(r.model ?? ""), String(r.make ?? "")),
      title_v2: buildTitle(r),
      slug: generateSlug(r),
    }));

  const path = out("clean", `${today}.json`);
  writeFileSync(path, JSON.stringify(cleaned, null, 1));
  console.log(
    `✅ ${cleaned.length} ${keepUnavailable ? "rows" : "available rows"} (of ${rows.length}) → ${path}`,
  );

  const brands = deriveBrands(cleaned);
  console.log(`   ${brands.length} distinct brands`);
  console.log(`   next: npm run ingest -- brands --in ${path}`);
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

  // Validate before doing any network work — a typo'd ratio should fail
  // immediately, not after fetching the whole CMS catalogue.
  const maxChangeRatio = parseMaxChangeRatio(flag("max-change-ratio"));
  if (maxChangeRatio !== undefined) {
    console.log(
      `  --max-change-ratio override: ${maxChangeRatio} (ceiling ${(maxChangeRatio * 100).toFixed(0)}%)`,
    );
  }

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

  // --partial says "this snapshot is deliberately a subset of the catalogue",
  // which disables the scrape-size floor ONLY. That floor compares the scrape
  // against the whole CMS, and the CMS keeps discontinued vehicles forever, so
  // a targeted repair run trips it by construction. The change-ratio guard
  // still applies.
  const partial = has("partial");
  if (partial) {
    console.log("  --partial: scrape-size floor disabled (change-ratio guard still active)");
  }

  assertPlanSane(plan, {
    maxChangeRatio,
    ...(partial ? { minScrapeRatio: 0 } : {}),
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
  // Persists `plan.completed` back to `planPath` in a `finally`, so a throw
  // partway through (a Directus request exhausting its retries, say) still
  // leaves a resumable checkpoint on disk instead of only in memory. Dry
  // runs never mutate `plan.completed`, so nothing is persisted for those —
  // it would just rewrite the file with itself.
  const res = await applyPlanAndPersist(plan, planPath, {
    dryRun,
    onProgress: (e, i, total) => {
      if (i % 25 === 0) console.log(`  ${i}/${total} …`);
    },
  });

  console.log(`✅ created ${res.created}, updated ${res.updated}, skipped ${res.skipped}`);
  if (res.created > 0) {
    console.log(`   New vehicles are drafts — add thumbnails and publish in Directus.`);
  }
}

async function cmdImages() {
  const dryRun = has("dry-run");
  const rawStatus = flag("status");
  if (rawStatus && rawStatus !== "draft" && rawStatus !== "published") {
    throw new Error(`--status must be "draft" or "published". Got "${rawStatus}".`);
  }
  const status = rawStatus as "draft" | "published" | undefined;
  const limit = parseLimit(flag("limit"));

  // Fail closed BEFORE reading the CMS: if the proxy is not configured there
  // is nothing to do, and we must never fall back to a direct download.
  const proxy = readProxyConfig(process.env);
  const dispatcher = createDispatcher(proxy);
  console.log(`  egress via Bright Data zone "${proxy.zone}" (${proxy.host})`);

  const vehicles = await fetchVehiclesForThumbnails(status);
  console.log(`  ${vehicles.length} vehicles${status ? ` with status ${status}` : ""}`);

  const seams: ThumbnailSeams = {
    download: async (url) => {
      const res = await undiciFetch(url, { dispatcher });
      if (!res.ok) {
        // Drain the body so the socket returns to the pool instead of being
        // held until GC — this loop makes 830 of these.
        await res.body?.cancel().catch(() => {});
        throw new Error(`download ${res.status} for ${url}`);
      }
      const bytes = Buffer.from(await res.arrayBuffer());
      // An HTTP 200 is not proof of a photo. See assertJpegBytes: writing our
      // own filename marker over a block page would mark the vehicle done
      // forever with a broken image.
      assertJpegBytes(bytes, url);
      return bytes;
    },
    // NOT directusFetch: it sets Content-Type: application/json BEFORE
    // spreading init.headers, so `headers: {}` cannot remove it and the
    // multipart boundary would never be sent. Verified by reading
    // src/lib/directus.ts. This one call goes direct, with the bearer set by
    // hand and no Content-Type, so FormData sets its own.
    uploadFile: async (bytes, filename, title) => {
      const form = new FormData();
      form.append("folder", VEHICLES_FOLDER_ID);
      form.append("title", title);
      form.append("file", new Blob([bytes], { type: "image/jpeg" }), filename);

      const res = await undiciFetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.DIRECTUS_STATIC_TOKEN}` },
        body: form,
      });
      if (!res.ok) throw new Error(`upload ${res.status}: ${(await res.text()).slice(0, 200)}`);

      const json = (await res.json()) as { data: { id: string } };
      return json.data.id;
    },
    attachThumbnail: async (vehicleId, fileId) => {
      await directusFetch(`/items/vehicles/${vehicleId}`, {
        method: "PATCH",
        body: JSON.stringify({ thumbnail: fileId }),
        next: { revalidate: 0 },
      });
    },
  };

  const r = await upgradeThumbnails(vehicles, seams, {
    dryRun,
    limit,
    onProgress: (done, total) => {
      if (done % 25 === 0 || done === total) console.log(`  ${done}/${total} …`);
    },
  });

  const notAttemptedSuffix = r.notAttempted > 0 ? `, ${r.notAttempted} not attempted (--limit)` : "";
  console.log(
    `\n${dryRun ? "[DRY RUN] " : ""}✅ uploaded ${r.uploaded}, skipped ${r.skipped}, failed ${r.failed}${notAttemptedSuffix}`,
  );
  if (r.noUrl.length) printTruncated("ℹ️  no source image url upstream", r.noUrl);
  if (r.failures.length) {
    printTruncated(
      "⚠️  failed",
      r.failures.map((f) => `${f.slug}: ${f.error}`),
    );
  }
  if (r.notAttempted > 0) {
    console.log(`   ${r.notAttempted} vehicles still need a thumbnail — re-run without --limit to finish.`);
  }
  if (!dryRun && r.uploaded > 0) {
    console.log("   Previous thumbnail files are kept — rollback is a repoint.");
  }
}

const commands: Record<string, () => Promise<void>> = {
  scrape: cmdScrape,
  clean: cmdClean,
  brands: cmdBrands,
  plan: cmdPlan,
  apply: cmdApply,
  images: cmdImages,
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

  validateFlags(command, process.argv.slice(2));
  await fn();
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
