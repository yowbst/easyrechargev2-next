/**
 * Transactional e-mails sent by the Make scenario "eR | P / Demande de devis".
 *
 *   npm run emails -- build   Render every email into emails/dist/ (Make HTML + sample preview)
 *   npm run emails -- push    Build, then write subject + HTML into the Make modules (writes!)
 *
 * Source of truth: emails/email-template.hbs.html (design) + emails/make/*.json
 * (content per language, mapped to Make module ids). Never edit these e-mails in
 * the Make UI — the next push overwrites them. SLA values come from Directus
 * site_settings.global_config.slas at build time. See emails/README.md.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderEmail, type EmailTokens, type Slas } from "../src/lib/emails/render";

const ROOT = join(__dirname, "..", "emails");
const MAKE_DIR = join(ROOT, "make");
const DIST = join(ROOT, "dist");
const BACKUPS = join(ROOT, ".backups");
const SCENARIO_ID = 3542973;
const MAKE_API = "https://eu2.make.com/api/v2";

type Lang = "fr" | "de" | "en";
interface EmailFile {
  modules: Partial<Record<Lang, number>>;
  fr?: Record<string, unknown> & { subject: string };
  de?: Record<string, unknown> & { subject: string };
  en?: Record<string, unknown> & { subject: string };
}
interface Built {
  name: string;
  lang: Lang;
  moduleId: number;
  subject: string;
  html: string;
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, "utf8")) as T;

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
      const content = email[lang];
      if (!content) throw new Error(`${file}: module ${moduleId} has no "${lang}" content`);
      const data = { ...common[lang], ...content };
      const make = renderEmail(template, data, tokens, "make", slas);
      const sample = renderEmail(template, data, tokens, "sample", slas);
      writeFileSync(join(DIST, "make", `${moduleId}-${name}-${lang}.html`), make.html);
      writeFileSync(join(DIST, "preview", `${name}-${lang}.html`), sample.html);
      built.push({ name, lang, moduleId, subject: make.subject, html: make.html });
    }
  }
  writeFileSync(
    join(DIST, "make", "manifest.json"),
    JSON.stringify(built.map(({ name, lang, moduleId, subject }) => ({ name, lang, moduleId, subject })), null, 2),
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
  const built = await build();
  const headers = { Authorization: `Token ${token}`, "Content-Type": "application/json" };

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
    return m?.html !== e.html || m?.subject !== e.subject;
  });
  if (mismatched.length > 0) {
    throw new Error(`Pushed, but modules differ on read-back: ${mismatched.map((e) => e.moduleId).join(", ")} (backup: ${backup})`);
  }
  console.log(`Pushed ${built.length} e-mails to Make scenario ${SCENARIO_ID} (backup: ${backup})`);
}

const command = process.argv[2];
const run = command === "build" ? build : command === "push" ? push : null;
if (!run) {
  console.log("Usage: npm run emails -- build | push");
  process.exit(1);
}
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
