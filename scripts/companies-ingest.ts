// scripts/companies-ingest.ts
// Swiss electrical installers from the commercial register. Run with --help.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildCompanyPlan, assertPlanSane, summarize } from "@/lib/companies/ingest/diff";
import { COMPANY_COMMAND_FLAGS } from "@/lib/companies/ingest/cli-flags";
import { isInstallerCandidate } from "@/lib/companies/ingest/candidates";
import { toCsv } from "@/lib/companies/ingest/export";
import { toCleanCompany } from "@/lib/companies/ingest/normalize";
import { effectiveClassification } from "@/lib/companies/ingest/publish-rule";
import { fetchActivePartners, fetchAllCmsCompanies, fetchPartnerUids, unmatchedPartners } from "@/lib/companies/ingest/queries";
import { buildReport } from "@/lib/companies/ingest/report";
import { CANTONS, fetchByUids, fetchCanton } from "@/lib/companies/ingest/sparql";
import { applyCompanyPlanAndPersist } from "@/lib/companies/ingest/upsert";
import {
  type DescriptionResult,
  type ClassificationLabel,
  type ClassificationResult,
  type ClassifiedCompany,
  type CleanCompany,
  type CompanyPlan,
  type RawCompany,
} from "@/lib/companies/ingest/types";
import { createDataForSeoLlm } from "@/lib/companies/llm/client";
import { DESCRIBE_VERSION, LIVE_PRICE_USD, PROMPT_VERSION } from "@/lib/companies/llm/config";
import { describePurposes, DESCRIBE_HEADER, type DescribeCache } from "@/lib/companies/llm/describe";
import { packItems } from "@/lib/companies/llm/batch";
import {
  classifyPurposes,
  evaluate,
  packBatches,
  type ClassifyCache,
  type ClassifyItem,
  type GoldenItem,
} from "@/lib/companies/llm/classify";
import { MIN_ROWS, parsePostcodeCsv, renderDatasetModule } from "@/lib/companies/geo/build-dataset";
import {
  parseArgs,
  parseLimit,
  parseMaxChangeRatio,
  truncateList,
  validateFlags,
} from "@/lib/vehicles/ingest/cli-helpers";

const HELP = `Usage: npm run companies -- <command> [options]

Swiss electrical installers from the commercial register (Zefix, via LINDAS)
into the Directus companies collection. Runbook: docs/companies-ingest.md

  geo-dataset --csv <file>    build src/shared/swiss-postcode-coordinates.ts from swisstopo's CSV
  fetch [--canton VD,VS]      LINDAS -> data/companies/raw/<stamp>.jsonl (read-only)
  normalize --in <raw>        derive fields, geocode -> data/companies/clean/<stamp>.json
  classify --in <clean>       installer / inspector / planner / solar / other -> classified/<stamp>.json
  classify --eval             run the golden set and print accuracy (gate 90%)
  describe --in <classified>  specialties + one-line trade description for installers -> described/<stamp>.json
  plan --in <described|classified>  diff against Directus -> plans/<stamp>.json (no writes)
  apply --plan <file>         execute a plan (the only command that writes rows)
  report [--canton ZH]        counts per canton from Directus
  export [--canton ZH,BE]     CSV for the sales list -> data/companies/export/<stamp>.csv

Options: --dry-run, --limit <n>, --max-cost <usd>, --max-change-ratio <n>, --partial,
         --force, --no-cms, --classification installer, --prospect-status none, --help`;

const { command, flag, has } = parseArgs(process.argv.slice(2));

const runStamp = new Date().toISOString().slice(0, 19).replace("T", "-").replace(/:/g, "");

/** Artefact path under data/companies/<dir>/, never one that already exists. */
const out = (dir: string, file: string) => {
  mkdirSync(`data/companies/${dir}`, { recursive: true });
  const dot = file.lastIndexOf(".");
  const [base, ext] = dot === -1 ? [file, ""] : [file.slice(0, dot), file.slice(dot)];
  let candidate = `data/companies/${dir}/${file}`;
  for (let n = 2; existsSync(candidate); n++) candidate = `data/companies/${dir}/${base}-${n}${ext}`;
  return candidate;
};

function requireFlag(name: string): string {
  const v = flag(name);
  if (!v) throw new Error(`--${name} is required.`);
  return v;
}

function cantonList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const bad = list.filter((c) => !(CANTONS as readonly string[]).includes(c));
  if (bad.length) throw new Error(`Unknown canton code(s): ${bad.join(", ")}. Valid: ${CANTONS.join(" ")}`);
  return list;
}

const readJsonLines = <T>(path: string): T[] =>
  readFileSync(path, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T);

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

// ─── geo-dataset ───────────────────────────────────────────

async function cmdGeoDataset() {
  const { rows, table } = parsePostcodeCsv(readFileSync(requireFlag("csv"), "utf8"));
  if (rows < MIN_ROWS) throw new Error(`Only ${rows} rows parsed (expected at least ${MIN_ROWS}). Wrong file?`);
  const target = "src/shared/swiss-postcode-coordinates.ts";
  writeFileSync(target, renderDatasetModule(table, new Date().toISOString().slice(0, 10)));
  console.log(`✓ ${rows} rows, ${Object.keys(table).length} keys → ${target}`);
}

// ─── fetch ─────────────────────────────────────────────────

async function cmdFetch() {
  const cantons = cantonList(flag("canton")) ?? [...CANTONS];
  const limit = parseLimit(flag("limit"));
  const path = out("raw", `${runStamp}.jsonl`);
  writeFileSync(path, "");
  const empty: string[] = [];
  let total = 0;
  for (const canton of cantons) {
    let rows: RawCompany[] = await fetchCanton(canton);
    if (limit) rows = rows.slice(0, limit);
    if (rows.length === 0) empty.push(canton);
    appendFileSync(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
    total += rows.length;
    console.log(`  ${canton}: ${rows.length}`);
  }
  if (!has("no-partners")) {
    const seen = new Set(readJsonLines<RawCompany>(path).map((r) => r.ehraid));
    const partners = await fetchActivePartners();
    const uids = partners.map((p) => p.uid).filter((u): u is string => !!u);
    const forced = (await fetchByUids(uids)).filter((r) => !seen.has(r.ehraid));
    if (forced.length) appendFileSync(path, forced.map((r) => JSON.stringify(r)).join("\n") + "\n");
    total += forced.length;
    console.log(`  partners: ${uids.length} UID(s) looked up, ${forced.length} added outside the installer pattern`);
  }
  console.log(`\n✓ ${total} candidates, ${cantons.length} cantons → ${path}`);
  if (empty.length && !flag("canton")) {
    throw new Error(`No rows for ${empty.join(", ")}. A full fetch should return rows for every canton; check LINDAS before going on.`);
  }
}

// ─── normalize ─────────────────────────────────────────────

async function cmdNormalize() {
  const raw = readJsonLines<RawCompany>(requireFlag("in"));
  const { lookupPostcode } = await import("@/lib/companies/geo/postcode-coords");
  const clean: CleanCompany[] = [];
  let droppedByPattern = 0;
  const noCoords = new Set<string>();
  for (const r of raw) {
    if (!isInstallerCandidate(r.purpose) && !r.forcedPartner) {
      droppedByPattern += 1;
      continue;
    }
    const c = toCleanCompany(r, (plz) => lookupPostcode(plz));
    if (c.lat === null && c.postal_code) noCoords.add(c.postal_code);
    clean.push(c);
  }
  const path = out("clean", `${runStamp}.json`);
  writeFileSync(path, JSON.stringify(clean, null, 1));
  console.log(`✓ ${clean.length} companies → ${path}`);
  if (droppedByPattern) console.log(`  ${droppedByPattern} dropped by the installer pattern (prefilter was wider)`);
  console.log(`  ${clean.filter((c) => c.in_liquidation).length} flagged in liquidation/bankruptcy`);
  console.log(`  ${clean.filter((c) => !c.uid).length} without a UID`);
  console.log(`  ${clean.filter((c) => c.installation_evidence === "weak").length} without explicit installation wording (never published unless partner or override)`);
  if (noCoords.size) {
    const { shown, hiddenCount } = truncateList([...noCoords].sort(), 15);
    console.log(`  ${noCoords.size} postcodes without coordinates: ${shown.join(", ")}${hiddenCount ? ` …and ${hiddenCount} more` : ""}`);
  }
}

// ─── classify ──────────────────────────────────────────────

const CACHE_DIR = "data/companies/cache/classify";

function fileCache(): ClassifyCache {
  mkdirSync(CACHE_DIR, { recursive: true });
  return {
    get(hash) {
      const p = `${CACHE_DIR}/${hash}.json`;
      if (!existsSync(p)) return undefined;
      const r = readJson<ClassificationResult>(p);
      return isCurrent(r) ? r : undefined;
    },
    set(hash, result) {
      writeFileSync(`${CACHE_DIR}/${hash}.json`, JSON.stringify(result));
    },
  };
}

/** A stored result counts only if it came from the current prompt version. */
const isCurrent = (r: ClassificationResult | undefined) =>
  !!r && !!r.classification_model && r.classification_model.endsWith(`:${PROMPT_VERSION}`);

const UNCLASSIFIED: ClassificationResult = {
  classification: "unclassified",
  classification_confidence: null,
  classification_reason: null,
  classification_model: null,
  classified_at: null,
  classified_purpose_hash: null,
};

function printClassifyStats(s: Awaited<ReturnType<typeof classifyPurposes>>) {
  const rate = s.calls ? ((s.unparseableCalls / s.calls) * 100).toFixed(1) : "0.0";
  console.log(`  ${s.calls} calls, $${s.spent.toFixed(3)} spent, ${s.classified} classified, ${s.failed} still unclassified`);
  console.log(`  unparseable replies: ${s.unparseableCalls} of ${s.calls} calls (${rate}%, gate 2%)`);
  if (s.capped) console.log("  ⚠ spending cap reached; re-run to continue (results are cached)");
  for (const [msg, n] of Object.entries(s.errors).sort((a, b) => b[1] - a[1]).slice(0, 5)) console.log(`  ✗ ${n}x ${msg}`);
}

async function cmdClassifyEval() {
  const golden = readJson<GoldenItem[]>("src/lib/companies/ingest/__fixtures__/purposes-golden.json");
  const items: ClassifyItem[] = golden.map((g) => ({ hash: g.id, name: g.name, purpose: g.purpose }));
  const est = packBatches(items).length * LIVE_PRICE_USD;
  const maxCost = Number(flag("max-cost") ?? Math.max(0.25, est * 2));
  console.log(`Golden set: ${golden.length} purposes, about ${packBatches(items).length} calls, ~$${est.toFixed(2)} (cap $${maxCost.toFixed(2)})`);
  if (has("dry-run")) return;

  const memory = new Map<string, ClassificationResult>();
  const stats = await classifyPurposes(items, {
    call: createDataForSeoLlm(),
    cache: { get: (h) => memory.get(h), set: (h, r) => void memory.set(h, r) },
    maxCost,
    onBatch: (d, t, spent) => process.stdout.write(`\r  batch ${d}/${t}, $${spent.toFixed(3)}`),
  });
  process.stdout.write("\n");
  const labels = new Map<string, ClassificationLabel | undefined>(
    [...memory.entries()].map(([id, r]) => [id, r.classification === "unclassified" ? undefined : (r.classification as ClassificationLabel)]),
  );
  const report = evaluate(golden, labels);
  printClassifyStats(stats);
  console.log(`\nAccuracy ${(report.accuracy * 100).toFixed(1)}% (${report.correct}/${report.total}), ${report.missing} unclassified. Gate: 90%.`);
  console.table(report.confusion);
  for (const m of report.mistakes) console.log(`  ✗ ${m.name}: expected ${m.expected}, got ${m.got}`);
  writeFileSync(out("eval", `${runStamp}.json`), JSON.stringify({ stats, report }, null, 1));
  const parseRate = stats.calls ? stats.unparseableCalls / stats.calls : 0;
  if (report.accuracy < 0.9 || parseRate > 0.02) {
    console.log("\n✗ Gate not met. Tune the prompt, or switch to the Gemini developer API if parsing is the problem.");
    process.exitCode = 2;
  } else console.log("\n✓ Gate met.");
}

async function cmdClassify() {
  if (has("eval")) return cmdClassifyEval();
  const cantons = cantonList(flag("canton"));
  const limit = parseLimit(flag("limit"));
  let companies = readJson<CleanCompany[]>(requireFlag("in"));
  if (cantons) companies = companies.filter((c) => cantons.includes(c.canton));
  if (limit) companies = companies.slice(0, limit);

  // --no-cms skips the Directus read: only the local cache is used to avoid re-paying for a purpose.
  const cms = has("no-cms") ? [] : await fetchAllCmsCompanies();
  const seeded = new Map<string, ClassificationResult>();
  if (!has("force")) {
    for (const r of cms) {
      if (r.classification && r.classification !== "unclassified" && r.classified_purpose_hash && isCurrent({ classification_model: r.classification_model } as ClassificationResult)) {
        seeded.set(r.classified_purpose_hash, {
          classification: r.classification,
          classification_confidence: r.classification_confidence === null ? null : Number(r.classification_confidence),
          classification_reason: (r.classification_reason as string | null) ?? null,
          classification_model: (r.classification_model as string | null) ?? null,
          classified_at: (r.classified_at as string | null) ?? null,
          classified_purpose_hash: r.classified_purpose_hash,
        });
      }
    }
  }
  const disk = fileCache();
  const results = new Map<string, ClassificationResult>();
  const cache: ClassifyCache = {
    get: (h) => results.get(h) ?? seeded.get(h) ?? (has("force") ? undefined : disk.get(h)),
    set: (h, r) => {
      results.set(h, r);
      disk.set(h, r);
    },
  };

  const distinct = new Map<string, ClassifyItem>();
  for (const c of companies) if (!distinct.has(c.purpose_hash)) distinct.set(c.purpose_hash, { hash: c.purpose_hash, name: c.legal_name, purpose: c.purpose_text });
  const pending = [...distinct.values()].filter((it) => !cache.get(it.hash));
  const calls = packBatches(pending).length;
  const estimate = calls * LIVE_PRICE_USD;
  const maxCost = Number(flag("max-cost") ?? Math.max(0.5, estimate * 1.5));
  console.log(`${companies.length} companies, ${distinct.size} distinct purposes, ${pending.length} to classify (${distinct.size - pending.length} already known)`);
  console.log(`About ${calls} calls, ~$${estimate.toFixed(2)} (cap $${maxCost.toFixed(2)})`);
  if (has("dry-run")) return;

  if (pending.length > 0) {
    const stats = await classifyPurposes(pending, {
      call: createDataForSeoLlm(),
      cache,
      maxCost,
      onBatch: (d, t, spent) => process.stdout.write(`\r  batch ${d}/${t}, $${spent.toFixed(3)}`),
    });
    process.stdout.write("\n");
    printClassifyStats(stats);
  }

  const classified: ClassifiedCompany[] = companies.map((c) => ({ ...c, ...(cache.get(c.purpose_hash) ?? UNCLASSIFIED) }));
  const dist: Record<string, number> = {};
  for (const c of classified) dist[c.classification] = (dist[c.classification] ?? 0) + 1;
  const path = out("classified", `${runStamp}.json`);
  writeFileSync(path, JSON.stringify(classified, null, 1));
  console.log(`\n✓ ${classified.length} rows → ${path}`);
  console.log("  " + Object.entries(dist).map(([k, v]) => `${k} ${v}`).join(", "));
}

// ─── describe ──────────────────────────────────────────────

const DESCRIBE_CACHE_DIR = "data/companies/cache/describe";
const isCurrentDescription = (r: DescriptionResult | undefined) =>
  !!r && !!r.described_model && r.described_model.endsWith(`:${DESCRIBE_VERSION}`);

async function cmdDescribe() {
  const cantons = cantonList(flag("canton"));
  const limit = parseLimit(flag("limit"));
  const rows = readJson<ClassifiedCompany[]>(requireFlag("in"));
  // Only what can be shown: installers (partners are installers too in practice; an
  // override to installer on another row gets its description on the next run).
  let targets = rows.filter((r) => r.classification === "installer");
  if (cantons) targets = targets.filter((r) => cantons.includes(r.canton));
  if (limit) targets = targets.slice(0, limit);

  mkdirSync(DESCRIBE_CACHE_DIR, { recursive: true });
  const seeded = new Map<string, DescriptionResult>();
  if (!has("force") && !has("no-cms")) {
    for (const r of await fetchAllCmsCompanies()) {
      const d: DescriptionResult = {
        specialties: (r.specialties as string[] | null) ?? null,
        trade_summary: (r.trade_summary as string | null) ?? null,
        described_model: (r.described_model as string | null) ?? null,
        described_at: (r.described_at as string | null) ?? null,
        described_purpose_hash: (r.described_purpose_hash as string | null) ?? null,
      };
      if (d.described_purpose_hash && isCurrentDescription(d)) seeded.set(d.described_purpose_hash, d);
    }
  }
  const results = new Map<string, DescriptionResult>();
  const cache: DescribeCache = {
    get: (h) => {
      if (results.has(h)) return results.get(h);
      if (seeded.has(h)) return seeded.get(h);
      const p = `${DESCRIBE_CACHE_DIR}/${h}.json`;
      if (has("force") || !existsSync(p)) return undefined;
      const r = readJson<DescriptionResult>(p);
      return isCurrentDescription(r) ? r : undefined;
    },
    set: (h, r) => {
      results.set(h, r);
      writeFileSync(`${DESCRIBE_CACHE_DIR}/${h}.json`, JSON.stringify(r));
    },
  };

  const distinct = new Map<string, ClassifyItem>();
  for (const r of targets) if (!distinct.has(r.purpose_hash)) distinct.set(r.purpose_hash, { hash: r.purpose_hash, name: r.legal_name, purpose: r.purpose_text });
  const pending = [...distinct.values()].filter((it) => !cache.get(it.hash));
  const calls = packItems(pending, DESCRIBE_HEADER).length;
  const estimate = calls * LIVE_PRICE_USD;
  const maxCost = Number(flag("max-cost") ?? Math.max(0.5, estimate * 1.5));
  console.log(`${targets.length} companies to describe, ${distinct.size} distinct purposes, ${pending.length} new`);
  console.log(`About ${calls} calls, ~$${estimate.toFixed(2)} (cap $${maxCost.toFixed(2)})`);
  if (has("dry-run")) return;

  if (pending.length) {
    const s = await describePurposes(pending, {
      call: createDataForSeoLlm(),
      cache,
      maxCost,
      onBatch: (d, t, spent) => process.stdout.write(`\r  batch ${d}/${t}, $${spent.toFixed(3)}`),
    });
    process.stdout.write("\n");
    printClassifyStats({ calls: s.calls, spent: s.spent, unparseableCalls: s.unparseableCalls, classified: s.hits, failed: s.failed, capped: s.capped, errors: s.errors });
  }

  const empty: DescriptionResult = { specialties: null, trade_summary: null, described_model: null, described_at: null, described_purpose_hash: null };
  const described = rows.map((r) => ({ ...r, ...(cache.get(r.purpose_hash) ?? empty) }));
  const path = out("described", `${runStamp}.json`);
  writeFileSync(path, JSON.stringify(described, null, 1));
  const withSummary = described.filter((r) => r.trade_summary).length;
  console.log(`\n✓ ${described.length} rows → ${path} (${withSummary} with a description)`);
}

// ─── plan / apply ──────────────────────────────────────────

function printTruncated(label: string, lines: string[], max = 10) {
  console.log(`  ${label} (${lines.length}):`);
  const { shown, hiddenCount } = truncateList(lines, max);
  for (const l of shown) console.log(`    ${l}`);
  if (hiddenCount) console.log(`    …and ${hiddenCount} more`);
}

async function cmdPlan() {
  const cantons = cantonList(flag("canton"));
  const inPath = requireFlag("in");
  let classified = readJson<ClassifiedCompany[]>(inPath);
  if (cantons) classified = classified.filter((c) => cantons.includes(c.canton));

  const [cms, partnerByUid, activePartners] = await Promise.all([fetchAllCmsCompanies(), fetchPartnerUids(), fetchActivePartners()]);
  const missing = unmatchedPartners(activePartners, new Set(classified.map((c) => c.uid).filter((u): u is string => !!u)));
  for (const m of missing) {
    console.log(`  ⚠ partner "${m.partner.name}" not linked: ${m.reason === "no_uid" ? "no UID on the partner record" : `UID ${m.partner.uid} not in this run`}`);
  }
  const plan = buildCompanyPlan(classified, cms, {
    sourceFile: inPath,
    partnerByUid,
    activePartnerIds: new Set(activePartners.map((p) => p.id)),
    scopeCantons: cantons,
  });
  assertPlanSane(plan, { partial: has("partial"), maxChangeRatio: parseMaxChangeRatio(flag("max-change-ratio")) });

  const s = summarize(plan);
  console.log(`Plan: ${plan.candidateCount} candidates, ${plan.cmsCount} live rows in the CMS${cantons ? ` (scope ${cantons.join(",")})` : ""}`);
  console.log("  " + Object.entries(s.buckets).map(([k, v]) => `${k} ${v}`).join("  "));
  console.log(`  status flips: PUBLISH ${s.publish}, UNPUBLISH ${s.unpublish}`);
  console.log(`  CREATE by canton: ${Object.entries(s.createsByCanton).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  console.log(`  CREATE by classification: ${Object.entries(s.classification).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);
  for (const bucket of ["CREATE", "UPDATE", "GONE", "REAPPEARED"] as const) {
    const lines = plan.entries
      .filter((e) => e.bucket === bucket)
      .map((e) => `${e.canton} ${e.legalName}${e.classification ? ` [${e.classification}]` : ""}${e.statusFlip ? ` ${e.statusFlip}` : ""}${bucket === "UPDATE" ? ` {${Object.keys(e.changes).filter((k) => k !== "pipeline_updated_at" && k !== "register_seen_at").join(",")}}` : ""}`);
    if (lines.length) printTruncated(bucket, lines, 20);
  }
  const path = out("plans", `${runStamp}.json`);
  writeFileSync(path, JSON.stringify(plan, null, 1));
  console.log(`\n✓ plan → ${path}\n  Review it, then: npm run companies -- apply --plan ${path} --dry-run`);
}

async function cmdApply() {
  const planPath = requireFlag("plan");
  const plan = readJson<CompanyPlan>(planPath);
  const dryRun = has("dry-run");
  const r = await applyCompanyPlanAndPersist(plan, planPath, {
    dryRun,
    onProgress: (e, i, total) => {
      if ((i + 1) % 25 === 0 || i + 1 === total) console.log(`  ${i + 1}/${total} ${e.bucket} ${e.legalName}`);
    },
  });
  console.log(`\n${dryRun ? "(dry run) would have" : "✓"} created ${r.created}, updated ${r.updated}, archived ${r.gone}, reappeared ${r.reappeared}, skipped ${r.skipped}`);
}

// ─── report / export ───────────────────────────────────────

async function cmdReport() {
  const rows = buildReport(await fetchAllCmsCompanies(), cantonList(flag("canton")));
  console.table(rows.map((r) => ({ canton: r.canton, rows: r.rows, installers: r.installers, published: r.published, partners: r.partners, enriched: r.enriched, gone: r.gone, prospects: Object.entries(r.prospects).filter(([k]) => k !== "none").map(([k, v]) => `${k}:${v}`).join(" ") })));
  const t = rows.reduce((a, r) => ({ rows: a.rows + r.rows, installers: a.installers + r.installers, published: a.published + r.published }), { rows: 0, installers: 0, published: 0 });
  console.log(`Total: ${t.rows} rows, ${t.installers} installers, ${t.published} published`);
}

async function cmdExport() {
  const cantons = cantonList(flag("canton"));
  const classes = flag("classification")?.split(",").map((s) => s.trim());
  const prospect = flag("prospect-status")?.split(",").map((s) => s.trim());
  const rows = (await fetchAllCmsCompanies()).filter(
    (r) =>
      !(r.status === "archived" && r.register_gone_at) &&
      !r.in_liquidation &&
      (!cantons || cantons.includes(String(r.canton))) &&
      (!classes || classes.includes(String(effectiveClassification(r)))) &&
      (!prospect || prospect.includes(String(r.prospect_status ?? "none"))),
  );
  const path = out("export", `${runStamp}.csv`);
  writeFileSync(path, toCsv(rows));
  console.log(`✓ ${rows.length} companies → ${path}`);
}

const commands: Record<string, () => Promise<void>> = {
  "geo-dataset": cmdGeoDataset,
  fetch: cmdFetch,
  normalize: cmdNormalize,
  classify: cmdClassify,
  describe: cmdDescribe,
  plan: cmdPlan,
  apply: cmdApply,
  report: cmdReport,
  export: cmdExport,
};

async function main() {
  if (command === "help" || has("help")) {
    console.log(HELP);
    return;
  }
  if (!command) {
    console.error(HELP);
    process.exit(1);
  }
  const fn = commands[command];
  if (!fn) {
    console.error(`Unknown command "${command}". Expected: ${Object.keys(commands).join(", ")}`);
    process.exit(1);
  }
  validateFlags(command, process.argv.slice(2), COMPANY_COMMAND_FLAGS);
  await fn();
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
