/**
 * Transactional e-mails sent by Make: "eR | P / Demande de devis" (default) and
 * any other scenario an e-mail file names with `"scenario": <id>`.
 *
 *   npm run emails -- build   Render every email into emails/dist/ (Make HTML + sample preview)
 *   npm run emails -- push    Build, then write subject + HTML into the Make modules (writes!)
 *   npm run emails -- push --scenario <id>   Same, one scenario only
 *
 * Source of truth: emails/email-template.hbs.html (design) + emails/make/*.json
 * (content per language, mapped to Make module ids). Never edit these e-mails in
 * the Make UI — the next push overwrites them. SLA values come from Directus
 * site_settings.global_config.slas at build time. See emails/README.md.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail, substituteTokens, type EmailTokens, type Slas } from "../src/lib/emails/render";

const ROOT = join(__dirname, "..", "emails");
const MAKE_DIR = join(ROOT, "make");
const DIST = join(ROOT, "dist");
const BACKUPS = join(ROOT, ".backups");
const DEFAULT_SCENARIO_ID = 3542973;
const MAKE_API = "https://eu2.make.com/api/v2";

type Lang = "fr" | "de" | "en";
interface EmailFile {
  /** Make scenario holding the modules; defaults to "eR | P / Demande de devis". */
  scenario?: number;
  /** Module id per language. A language without one is rendered to preview only. */
  modules: Partial<Record<Lang, number>>;
  /**
   * Other module fields to push (headers, inReplyTo, references…), the same for
   * every language. %tokens% are substituted with their Make expression.
   */
  mapper?: Record<string, unknown>;
  fr?: Record<string, unknown> & { subject: string };
  de?: Record<string, unknown> & { subject: string };
  en?: Record<string, unknown> & { subject: string };
}
interface Built {
  name: string;
  lang: Lang;
  scenarioId: number;
  moduleId: number;
  subject: string;
  html: string;
  mapper: Record<string, unknown>;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

/** Substitute %tokens% in every string of a module-field value (Make expressions keep their quotes). */
function mapTokens(value: unknown, tokens: EmailTokens): unknown {
  if (typeof value === "string") return substituteTokens(value, tokens, "make");
  if (Array.isArray(value)) return value.map((v) => mapTokens(v, tokens));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapTokens(v, tokens)]));
  }
  return value;
}

async function fetchSlas(): Promise<Slas> {
  const base = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  if (!base || !token) throw new Error("DIRECTUS_URL / DIRECTUS_STATIC_TOKEN missing (.env.local)");
  const res = await fetch(`${base}/items/site_settings?fields=global_config`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Directus site_settings: ${res.status}`);
  const slas = (await res.json())?.data?.global_config?.slas;
  const first = slas?.first_contact?.value;
  const delivery = slas?.quote_delivery_timeline?.value;
  if (first == null || delivery == null) throw new Error("global_config.slas incomplete");
  return { first_contact: first, quote_delivery_timeline: delivery };
}

async function build(): Promise<Built[]> {
  const template = readFileSync(join(ROOT, "email-template.hbs.html"), "utf8");
  const tokens = readJson<EmailTokens>(join(MAKE_DIR, "tokens.json"));
  delete (tokens as Record<string, unknown>).$comment;
  const common = readJson<Record<Lang, Record<string, unknown>>>(join(MAKE_DIR, "common.json"));
  const slas = await fetchSlas();

  mkdirSync(join(DIST, "make"), { recursive: true });
  mkdirSync(join(DIST, "preview"), { recursive: true });

  const built: Built[] = [];
  const files = readdirSync(MAKE_DIR).filter((f) => f.endsWith(".json") && !["tokens.json", "common.json"].includes(f));
  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const email = readJson<EmailFile>(join(MAKE_DIR, file));
    for (const [lang, moduleId] of Object.entries(email.modules) as [Lang, number][]) {
      if (!email[lang]) throw new Error(`${file}: module ${moduleId} has no "${lang}" content`);
    }
    for (const lang of ["fr", "de", "en"] as const) {
      const content = email[lang];
      if (!content) continue;
      const data = { ...common[lang], ...content };
      const sample = renderEmail(template, data, tokens, "sample", slas);
      writeFileSync(join(DIST, "preview", `${name}-${lang}.html`), sample.html);
      const moduleId = email.modules[lang];
      if (moduleId === undefined) continue;
      const make = renderEmail(template, data, tokens, "make", slas);
      writeFileSync(join(DIST, "make", `${moduleId}-${name}-${lang}.html`), make.html);
      built.push({
        name,
        lang,
        scenarioId: email.scenario ?? DEFAULT_SCENARIO_ID,
        moduleId,
        subject: make.subject,
        html: make.html,
        mapper: mapTokens(email.mapper ?? {}, tokens) as Record<string, unknown>,
      });
    }
  }
  writeFileSync(
    join(DIST, "make", "manifest.json"),
    JSON.stringify(built.map(({ name, lang, scenarioId, moduleId, subject }) => ({ name, lang, scenarioId, moduleId, subject })), null, 2),
  );
  console.log(`Built ${built.length} e-mails (SLA: ${slas.first_contact} h, ${slas.quote_delivery_timeline} days) → emails/dist/`);
  return built;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MakeModule = { id: number; module: string; mapper?: Record<string, any>; routes?: { flow: MakeModule[] }[] };

function* walk(flow: MakeModule[]): Generator<MakeModule> {
  for (const m of flow) {
    yield m;
    for (const r of m.routes ?? []) yield* walk(r.flow);
  }
}

async function push() {
  const token = process.env.MAKE_API_TOKEN;
  if (!token) throw new Error("MAKE_API_TOKEN missing (.env.local)");
  const all = await build();
  const headers = { Authorization: `Token ${token}`, "Content-Type": "application/json" };
  // `--scenario <id>` pushes one scenario only, leaving the others untouched.
  const flag = process.argv.indexOf("--scenario");
  const only = flag > 0 ? Number(process.argv[flag + 1]) : null;
  if (only !== null && !all.some((e) => e.scenarioId === only)) throw new Error(`No e-mail targets scenario ${only}`);
  for (const scenarioId of new Set(all.map((e) => e.scenarioId))) {
    if (only !== null && scenarioId !== only) continue;
    await pushScenario(scenarioId, all.filter((e) => e.scenarioId === scenarioId), headers);
  }
}

async function pushScenario(SCENARIO_ID: number, built: Built[], headers: Record<string, string>) {
  const res = await fetch(`${MAKE_API}/scenarios/${SCENARIO_ID}/blueprint`, { headers });
  if (!res.ok) throw new Error(`Make blueprint: ${res.status}`);
  const blueprint = (await res.json()).response.blueprint;
  mkdirSync(BACKUPS, { recursive: true });
  const backup = join(BACKUPS, `make-${SCENARIO_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(backup, JSON.stringify(blueprint));

  const modules = new Map([...walk(blueprint.flow)].map((m) => [m.id, m]));
  for (const email of built) {
    const mod = modules.get(email.moduleId);
    if (!mod || mod.module !== "email:ActionSendEmail" || !mod.mapper) {
      throw new Error(`Module ${email.moduleId} (${email.name}/${email.lang}) is not an e-mail module — nothing pushed`);
    }
    Object.assign(mod.mapper, email.mapper);
    mod.mapper.subject = email.subject;
    mod.mapper.html = email.html;
    mod.mapper.contentType = "html";
  }

  const patch = await fetch(`${MAKE_API}/scenarios/${SCENARIO_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ blueprint: JSON.stringify(blueprint) }),
  });
  if (!patch.ok) throw new Error(`Make PATCH: ${patch.status} ${await patch.text()}`);

  // Read back and compare, so a silent Make-side rewrite is caught.
  const after = (await (await fetch(`${MAKE_API}/scenarios/${SCENARIO_ID}/blueprint`, { headers })).json()).response.blueprint;
  const afterModules = new Map([...walk(after.flow)].map((m) => [m.id, m]));
  const mismatched = built.filter((e) => {
    const m = afterModules.get(e.moduleId)?.mapper;
    return (
      m?.html !== e.html ||
      m?.subject !== e.subject ||
      Object.entries(e.mapper).some(([k, v]) => JSON.stringify(m?.[k]) !== JSON.stringify(v))
    );
  });
  if (mismatched.length > 0) {
    throw new Error(`Pushed, but modules differ on read-back: ${mismatched.map((e) => e.moduleId).join(", ")} (backup: ${backup})`);
  }
  console.log(`Pushed ${built.length} e-mails to Make scenario ${SCENARIO_ID} (backup: ${backup})`);
}

const command = process.argv[2];
const run = command === "build" ? build : command === "push" ? push : null;
if (!run) {
  console.log("Usage: npm run emails -- build | push [--scenario <id>]");
  process.exit(1);
}
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
