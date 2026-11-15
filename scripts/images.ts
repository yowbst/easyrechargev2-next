/**
 * Site images in the house style, through Vercel AI Gateway: `npm run images -- <command>`.
 * Commands and flags: USAGE in src/lib/images/pipeline.ts (the only copy; printed on errors).
 *
 * Style, presets and reference photos (Directus asset ids): brand/image-presets.json.
 * Every generation and edit is appended to brand/image-manifest.jsonl (model,
 * prompt, refIds, real cost, pixel size, output path) so any image can be made again.
 * The review folder and the reference cache live under .images/ (gitignored).
 * `publish` is read-only unless given --apply, and runs only after Yoan's explicit go
 * — runbook: docs/image-pipeline.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import {
  apiError,
  aspectWarning,
  buildEditPrompt,
  buildGatewayRequest,
  buildPrompt,
  findEntry,
  illustrationTitle,
  imageSize,
  manifestEntry,
  outputName,
  parseArgs,
  parseGatewayResponse,
  resolvePreset,
  type ImageConfig,
  type InlineImage,
  type ManifestEntry,
  type ManifestFields,
  type ResolvedPreset,
} from "../src/lib/images/pipeline";

const ROOT = join(__dirname, "..");
const CONFIG_FILE = join(ROOT, "brand", "image-presets.json");
const MANIFEST = join(ROOT, "brand", "image-manifest.jsonl");
const REVIEW = join(ROOT, ".images", "review");
const REF_CACHE = join(ROOT, ".images", "refs");
const GATEWAY = "https://ai-gateway.vercel.sh";

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const env = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing (.env.local)`);
  return v;
};

const loadConfig = () => JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as ImageConfig;
const readManifest = () => {
  if (!existsSync(MANIFEST)) throw new Error(`${relative(ROOT, MANIFEST)} is missing`);
  return readFileSync(MANIFEST, "utf8");
};
const usd = (cost: number | null) => (cost === null ? "cost not reported" : `$${cost.toFixed(4)}`);

/** An image file as base64 + MIME type, ready to attach to a gateway call. */
function readInlineImage(file: string): InlineImage {
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
      if (!res.ok) throw apiError(`Directus reference ${id}`, res.status, await res.text());
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      console.log(`  cached reference ${id}`);
    }
    images.push(readInlineImage(file));
  }
  return images;
}

/** One image from the gateway: chat completions or the images API, depending on the model. */
async function callGateway(model: string, prompt: string, images: InlineImage[], aspect?: string) {
  const req = buildGatewayRequest(model, prompt, images, aspect);
  const res = await fetch(`${GATEWAY}${req.path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env("AI_GATEWAY_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(req.body),
  });
  if (!res.ok) throw apiError(`AI Gateway ${req.path}`, res.status, await res.text());
  return parseGatewayResponse(model, await res.json());
}

/**
 * Writes the image to .images/review/, appends its manifest line, and warns when its
 * pixel size is unreadable or more than 5% off `aspect`.
 */
function saveToReviewAndLog(
  bytes: Uint8Array,
  name: string,
  fields: Omit<ManifestFields, "output" | "width" | "height">,
  aspect?: string,
): ManifestEntry {
  mkdirSync(REVIEW, { recursive: true });
  const file = join(REVIEW, name);
  writeFileSync(file, bytes);
  const size = imageSize(bytes);
  const logged = manifestEntry({ ...fields, width: size?.width ?? null, height: size?.height ?? null, output: relative(ROOT, file) });
  appendFileSync(MANIFEST, `${JSON.stringify(logged)}\n`);
  console.log(`  ${logged.output}  ${size ? `${size.width}×${size.height}` : "size unreadable"}  (${usd(fields.cost)})`);
  if (!size) console.warn(`  warning: could not read the pixel size of ${name}; aspect not checked`);
  else if (aspect) {
    const warning = aspectWarning(size, aspect);
    if (warning) console.warn(`  warning: ${warning}`);
  }
  return logged;
}

async function generate(preset: ResolvedPreset, prompt: string, n: number, subject?: string) {
  const refs = await loadRefs(preset.refIds);
  const at = new Date();
  let total: number | null = 0;
  for (let i = 1; i <= n; i++) {
    const image = await callGateway(preset.model, prompt, refs, preset.aspect);
    total = total === null || image.cost === null ? null : total + image.cost;
    saveToReviewAndLog(
      image.bytes,
      outputName(preset.name, at, i, image.ext),
      { kind: "generate", at, model: preset.model, preset: preset.name, subject, prompt, refIds: preset.refIds, cost: image.cost },
      preset.aspect,
    );
  }
  console.log(`${n} option(s), total ${usd(total)}. Review them in .images/review/.`);
}

async function edit(file: string, change: string, model: string) {
  const prompt = buildEditPrompt(change);
  const image = await callGateway(model, prompt, [readInlineImage(file)]);
  const label = `${basename(file, extname(file))}-edit`;
  saveToReviewAndLog(image.bytes, outputName(label, new Date(), 1, image.ext), {
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

/** The model that made `file`, from its manifest entry; fails when the file is not in the manifest. */
function modelFor(file: string): string {
  const id = basename(file, extname(file));
  try {
    return findEntry(readManifest(), id).model;
  } catch (err) {
    throw new Error(`edit: cannot tell which model made ${file} (${(err as Error).message}); edit works on pipeline outputs only`);
  }
}

/** JPEG q85 via sharp (bundled with Next). Fails rather than upload an unconverted file. */
async function toJpeg(file: string): Promise<{ bytes: Buffer; name: string; type: string }> {
  let sharp: typeof import("sharp");
  try {
    sharp = (await import("sharp")).default;
  } catch (err) {
    throw new Error(`publish needs sharp to convert to JPEG and could not load it: ${(err as Error).message}`);
  }
  try {
    const bytes = await sharp(file).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { bytes, name: `${basename(file, extname(file))}.jpg`, type: "image/jpeg" };
  } catch (err) {
    throw new Error(`publish: JPEG conversion of ${file} failed: ${(err as Error).message}`);
  }
}

async function publish(file: string, rawTitle: string, apply: boolean) {
  const title = illustrationTitle(rawTitle);
  const jpeg = await toJpeg(file);
  const plan = { title, filename_download: jpeg.name, type: jpeg.type, bytes: jpeg.bytes.length };
  if (!apply) {
    console.log("read-only — would POST /files:", plan);
    console.log("Nothing sent. Re-run with --apply to upload (only after Yoan's go).");
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
  if (!res.ok) throw apiError("Directus POST /files", res.status, await res.text());
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
      return generate(preset, prompt, cmd.n, cmd.subject);
    }
    case "edit":
      return edit(cmd.file, cmd.change, modelFor(cmd.file));
    case "regenerate": {
      const entry = findEntry(readManifest(), cmd.id);
      if (entry.kind === "edit") {
        if (!entry.source || !existsSync(join(ROOT, entry.source))) throw new Error(`source of ${cmd.id} is gone: ${entry.source}`);
        return edit(join(ROOT, entry.source), entry.change ?? "", entry.model);
      }
      if (!entry.preset) throw new Error(`manifest entry ${cmd.id} has no preset to regenerate from`);
      // The preset's current framing and aspect, with the entry's own model and references.
      const preset = { ...resolvePreset(config, entry.preset), model: entry.model, refIds: entry.refIds };
      return generate(preset, entry.prompt, 1, entry.subject);
    }
    case "refs":
      await loadRefs(config.refs.map((r) => r.id));
      return console.log(`${config.refs.length} reference(s) in .images/refs/`);
    case "publish":
      return publish(cmd.file, cmd.title, cmd.apply);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
