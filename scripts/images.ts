/**
 * Site images in the house style, through Vercel AI Gateway.
 *
 *   npm run images -- generate <preset> "<subject>" [--n 3]   N options → .images/review/
 *   npm run images -- edit <file> "<change>"                  minimal edit pass on one option
 *   npm run images -- regenerate <manifest-id>                rerun a manifest entry
 *   npm run images -- refs                                    fill the reference-photo cache
 *   npm run images -- publish <file> --title "…" [--dry-run]  JPEG q85 → Directus (writes!)
 *
 * Style, presets and reference photos (Directus asset ids): brand/image-presets.json.
 * Every generation and edit is appended to brand/image-manifest.jsonl (model,
 * prompt, refs, real cost, output path) so any image can be made again. The
 * review folder and the reference cache live under .images/ (gitignored).
 * Publish only after Yoan's explicit go — runbook: docs/image-pipeline.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  buildChatBody,
  buildEditPrompt,
  buildPrompt,
  findEntry,
  illustrationTitle,
  manifestEntry,
  outputName,
  parseArgs,
  parseChatResponse,
  resolvePreset,
  type ImageConfig,
  type InlineImage,
  type ManifestEntry,
  type ManifestInput,
} from "../src/lib/images/pipeline";

const ROOT = join(__dirname, "..");
const CONFIG_FILE = join(ROOT, "brand", "image-presets.json");
const MANIFEST = join(ROOT, "brand", "image-manifest.jsonl");
const REVIEW = join(ROOT, ".images", "review");
const REF_CACHE = join(ROOT, ".images", "refs");
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing (.env.local)`);
  return v;
};

const loadConfig = () => JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as ImageConfig;
const usd = (cost: number | null) => (cost === null ? "cost not reported" : `$${cost.toFixed(4)}`);

function inline(file: string): InlineImage {
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) throw new Error(`unsupported image type: ${file}`);
  return { mime, base64: readFileSync(file).toString("base64") };
}

/** Reference photos from the local cache, downloaded from Directus (1024px JPEG) when missing. */
async function loadRefs(ids: string[]): Promise<InlineImage[]> {
  mkdirSync(REF_CACHE, { recursive: true });
  const images: InlineImage[] = [];
  for (const id of ids) {
    const file = join(REF_CACHE, `${id}.jpg`);
    if (!existsSync(file)) {
      const res = await fetch(`${env("DIRECTUS_URL")}/assets/${id}?width=1024&format=jpg&quality=80`, {
        headers: { Authorization: `Bearer ${env("DIRECTUS_STATIC_TOKEN")}` },
      });
      if (!res.ok) throw new Error(`reference ${id}: Directus ${res.status}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log(`  cached reference ${id}`);
    }
    images.push(inline(file));
  }
  return images;
}

async function callGateway(model: string, text: string, images: InlineImage[]) {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("AI_GATEWAY_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildChatBody(model, text, images)),
  });
  if (!res.ok) throw new Error(`AI Gateway ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return parseChatResponse(await res.json());
}

/** Writes the image to the review folder and logs it in the manifest. */
function keep(bytes: Uint8Array, name: string, entry: Omit<ManifestInput, "output">): ManifestEntry {
  mkdirSync(REVIEW, { recursive: true });
  const file = join(REVIEW, name);
  writeFileSync(file, bytes);
  const logged = manifestEntry({ ...entry, output: relative(ROOT, file) });
  appendFileSync(MANIFEST, `${JSON.stringify(logged)}\n`);
  console.log(`  ${logged.output}  (${usd(entry.cost)})`);
  return logged;
}

async function generate(opts: { label: string; model: string; preset?: string; subject?: string; prompt: string; refIds: string[]; n: number }) {
  const refs = await loadRefs(opts.refIds);
  const at = new Date();
  let total = 0;
  for (let i = 1; i <= opts.n; i++) {
    const image = await callGateway(opts.model, opts.prompt, refs);
    total += image.cost ?? 0;
    keep(image.bytes, outputName(opts.label, at, i, image.ext), {
      kind: "generate",
      at,
      model: opts.model,
      preset: opts.preset,
      subject: opts.subject,
      prompt: opts.prompt,
      refIds: opts.refIds,
      cost: image.cost,
    });
  }
  console.log(`${opts.n} option(s), total $${total.toFixed(4)}. Review them in .images/review/.`);
}

async function edit(file: string, change: string, model: string) {
  const prompt = buildEditPrompt(change);
  const image = await callGateway(model, prompt, [inline(file)]);
  const label = `${basename(file, extname(file))}-edit`;
  keep(image.bytes, outputName(label, new Date(), 1, image.ext), {
    kind: "edit",
    at: new Date(),
    model,
    change,
    prompt,
    refIds: [],
    source: relative(ROOT, resolve(file)),
    cost: image.cost,
  });
}

/** The model that made `file`, from the manifest; the default model otherwise. */
function modelFor(file: string, fallback: string): string {
  if (!existsSync(MANIFEST)) return fallback;
  try {
    return findEntry(readFileSync(MANIFEST, "utf8"), basename(file, extname(file))).model;
  } catch {
    return fallback;
  }
}

/** JPEG q85 via sharp (bundled with Next); the file as-is when sharp is unavailable. */
async function toJpeg(file: string): Promise<{ bytes: Buffer; name: string; type: string }> {
  const name = `${basename(file, extname(file))}.jpg`;
  try {
    const sharp = (await import("sharp")).default;
    return { bytes: await sharp(file).jpeg({ quality: 85, mozjpeg: true }).toBuffer(), name, type: "image/jpeg" };
  } catch (err) {
    console.warn(`  sharp unavailable (${(err as Error).message}); uploading the file unconverted`);
    return { bytes: readFileSync(file), name: basename(file), type: MIME[extname(file).toLowerCase()] };
  }
}

async function publish(file: string, rawTitle: string, dryRun: boolean) {
  const title = illustrationTitle(rawTitle);
  const jpeg = await toJpeg(file);
  if (dryRun) {
    console.log("dry run — would POST /files:", { title, filename_download: jpeg.name, type: jpeg.type, bytes: jpeg.bytes.length });
    return;
  }
  const form = new FormData();
  form.append("title", title);
  form.append("file", new Blob([new Uint8Array(jpeg.bytes)], { type: jpeg.type }), jpeg.name);
  const res = await fetch(`${env("DIRECTUS_URL")}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("DIRECTUS_STATIC_TOKEN")}` },
    body: form,
  });
  if (!res.ok) throw new Error(`Directus POST /files: ${res.status} ${await res.text()}`);
  const { data } = (await res.json()) as { data: { id: string } };
  console.log(`uploaded "${title}" → asset ${data.id}`);
}

async function main() {
  const cmd = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  switch (cmd.command) {
    case "generate": {
      const preset = resolvePreset(config, cmd.preset);
      const prompt = buildPrompt({ ...preset, subject: cmd.subject, refCount: preset.refIds.length });
      return generate({ label: preset.name, model: preset.model, preset: preset.name, subject: cmd.subject, prompt, refIds: preset.refIds, n: cmd.n });
    }
    case "edit":
      return edit(cmd.file, cmd.change, modelFor(cmd.file, config.model));
    case "regenerate": {
      const entry = findEntry(readFileSync(MANIFEST, "utf8"), cmd.id);
      if (entry.kind === "edit") {
        if (!entry.source || !existsSync(join(ROOT, entry.source))) throw new Error(`source of ${cmd.id} is gone: ${entry.source}`);
        return edit(join(ROOT, entry.source), entry.change ?? "", entry.model);
      }
      return generate({ label: entry.preset ?? entry.id, model: entry.model, preset: entry.preset, subject: entry.subject, prompt: entry.prompt, refIds: entry.refs, n: 1 });
    }
    case "refs":
      await loadRefs(config.refs.map((r) => r.id));
      return console.log(`${config.refs.length} reference(s) in .images/refs/`);
    case "publish":
      return publish(cmd.file, cmd.title, cmd.dryRun);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
