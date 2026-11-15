/**
 * Image pipeline — the pure parts of `npm run images` (scripts/images.ts).
 *
 * Prompt building, preset resolution, the AI Gateway request/response shapes,
 * manifest entries and argument parsing. No network, no filesystem: the script
 * does the I/O. Runbook: docs/image-pipeline.md; house style:
 * docs/brand/image-style.md; config: brand/image-presets.json.
 */

/** API error bodies (gateway, Directus) are cut to this many characters. */
const ERROR_BODY_MAX = 500;

/** The error for a failed HTTP call: `<call> <status>: <body, cut>`. */
export function apiError(call: string, status: number, body: string): Error {
  const cut = body.length > ERROR_BODY_MAX ? `${body.slice(0, ERROR_BODY_MAX)}…` : body;
  return new Error(`${call} ${status}: ${cut}`);
}

const COUNT_WORDS =["no", "one", "two", "three", "four", "five", "six"];

export interface PromptInput {
  style: string;
  framing: string;
  subject: string;
  refCount: number;
}

/** Style-reference intro + subject + house style + the preset's framing. */
export function buildPrompt({ style, framing, subject, refCount }: PromptInput): string {
  const count = COUNT_WORDS[refCount] ?? String(refCount);
  const intro =
    `The ${count} attached ${refCount === 1 ? "photograph defines" : "photographs define"} our brand's photographic style: ` +
    "light, palette, materials, framing and mood. Create a NEW photograph in exactly that style (do not copy their content). ";
  return `${intro}${subject.trim()} ${style}, ${framing}.`;
}

/** Edit pass on one chosen option: the change, and nothing else moves. */
export function buildEditPrompt(change: string): string {
  const c = change.trim();
  return (
    `Edit the attached photograph with one minimal change: ${/[.!?]$/.test(c) ? c : `${c}.`} ` +
    "Keep everything else identical: composition, framing, light, colours, materials and style. " +
    "No people, no text, no lettering, no brand logos."
  );
}

export interface ImageRef {
  /** Directus asset id; downloaded and cached locally at run time. */
  id: string;
  label: string;
}

export interface PresetConfig {
  aspect: string;
  /** Appended to the house style, e.g. "landscape 16:10 framing". */
  framing: string;
  model?: string;
}

/** Shape of brand/image-presets.json. */
export interface ImageConfig {
  model: string;
  style: string;
  refs: ImageRef[];
  presets: Record<string, PresetConfig>;
}

export interface ResolvedPreset {
  name: string;
  model: string;
  aspect: string;
  framing: string;
  style: string;
  refIds: string[];
}

export function resolvePreset(config: ImageConfig, name: string): ResolvedPreset {
  const preset = config.presets[name];
  if (!preset) {
    throw new Error(`unknown preset "${name}" — known: ${Object.keys(config.presets).join(", ")}`);
  }
  return {
    name,
    model: preset.model ?? config.model,
    aspect: preset.aspect,
    framing: preset.framing,
    style: config.style,
    refIds: config.refs.map((r) => r.id),
  };
}

export interface InlineImage {
  mime: string;
  base64: string;
}

/** POST /v1/chat/completions body: text first, then every attached image. */
export function buildChatBody(model: string, text: string, images: InlineImage[]) {
  return {
    model,
    modalities: ["text", "image"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text },
          ...images.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mime};base64,${img.base64}` },
          })),
        ],
      },
    ],
  };
}

export interface GeneratedImage {
  bytes: Uint8Array;
  ext: string;
  /** USD, from `usage.cost`; null when the gateway did not report it. */
  cost: number | null;
}

interface ChatResponse {
  choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[];
  usage?: { cost?: number };
}

/** Image at choices[0].message.images[0].image_url.url (a data URL) + usage.cost. */
export function parseChatResponse(response: ChatResponse): GeneratedImage {
  const message = response.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url ?? "";
  const match = /^data:image\/([a-z+]+);base64,([\s\S]+)$/.exec(url);
  if (!match) {
    throw new Error(`no image in the response — model said: ${message?.content || "(nothing)"}`);
  }
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  return {
    bytes: new Uint8Array(Buffer.from(match[2], "base64")),
    ext,
    cost: typeof response.usage?.cost === "number" ? response.usage.cost : null,
  };
}

/** Image-only models (no chat endpoint) go through the OpenAI-compatible images API. */
const usesImagesApi = (model: string) => model.startsWith("openai/") || model.startsWith("bfl/");

export interface GatewayRequest {
  /** Path under https://ai-gateway.vercel.sh. */
  path: string;
  body: object;
}

/**
 * The AI Gateway call for one image. Chat models: /v1/chat/completions. Image-only models:
 * /v1/images/edits with the references, /v1/images/generations (sized from the aspect) without.
 */
export function buildGatewayRequest(model: string, prompt: string, images: InlineImage[], aspect?: string): GatewayRequest {
  if (!usesImagesApi(model)) return { path: "/v1/chat/completions", body: buildChatBody(model, prompt, images) };
  if (images.length > 0) {
    return {
      path: "/v1/images/edits",
      body: { model, prompt, images: images.map((img) => ({ image_url: `data:${img.mime};base64,${img.base64}` })), n: 1 },
    };
  }
  if (!aspect) throw new Error(`${model} without references needs the preset's aspect to pick a size`);
  const ratio = aspectRatio(aspect);
  const size = ratio > 1.05 ? "1536x1024" : ratio < 0.95 ? "1024x1536" : "1024x1024";
  return { path: "/v1/images/generations", body: { model, prompt, n: 1, size } };
}

interface ImagesResponse {
  data?: { b64_json?: string }[];
  usage?: { cost?: number };
}

/** File extension from the magic bytes. */
function sniffExt(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  throw new Error("the gateway returned an image in an unknown format");
}

/** The image of a gateway answer, read the way `model`'s endpoint answers. */
export function parseGatewayResponse(model: string, response: unknown): GeneratedImage {
  if (!usesImagesApi(model)) return parseChatResponse(response as ChatResponse);
  const { data, usage } = response as ImagesResponse;
  const b64 = data?.[0]?.b64_json;
  if (!b64) throw new Error(`no image in the response: ${JSON.stringify(response).slice(0, ERROR_BODY_MAX)}`);
  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  return { bytes, ext: sniffExt(bytes), cost: typeof usage?.cost === "number" ? usage.cost : null };
}

/** `<label>-YYYYMMDD-HHMMSS-<n>.<ext>`, UTC. */
export function outputName(label: string, at: Date, index: number, ext: string): string {
  const stamp = at.toISOString().slice(0, 19).replace(/-|:/g, "").replace("T", "-");
  return `${label}-${stamp}-${index}.${ext}`;
}

/** One line of brand/image-manifest.jsonl. */
export interface ManifestEntry {
  /** The output file name without extension. */
  id: string;
  at: string;
  kind: "generate" | "edit";
  model: string;
  preset?: string;
  subject?: string;
  /** Edit pass: the requested change. */
  change?: string;
  prompt: string;
  /** Directus asset ids of the reference photos attached to the call. */
  refIds: string[];
  /** Edit pass: the image that was edited. */
  source: string | null;
  cost: number | null;
  /** Pixel size of the returned image; null when its format could not be read. */
  width?: number | null;
  height?: number | null;
  /** Path of the image file; null for an entry with no file in the repo (made by hand). */
  output: string | null;
  note?: string;
}

/** What the script knows after a call; `manifestEntry` derives the id and dates it. */
export type ManifestFields = Omit<ManifestEntry, "id" | "at" | "source" | "output" | "note"> & {
  at: Date;
  source?: string;
  output: string;
};

export function manifestEntry({ at, source, output, ...fields }: ManifestFields): ManifestEntry {
  const base = output.split("/").pop() ?? output;
  return {
    id: base.replace(/\.[^.]+$/, ""),
    at: at.toISOString(),
    ...fields,
    source: source ?? null,
    output,
  };
}

export function findEntry(manifest: string, id: string): ManifestEntry {
  const lines = manifest.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let entry: ManifestEntry;
    try {
      entry = JSON.parse(lines[i]) as ManifestEntry;
    } catch (err) {
      throw new Error(`brand/image-manifest.jsonl line ${i + 1} is not valid JSON: ${(err as Error).message}`);
    }
    if (entry.id === id) return entry;
  }
  throw new Error(`no manifest entry "${id}"`);
}

/** The one usage text: printed on errors, quoted in scripts/images.ts and CLAUDE.md. */
export const USAGE = `usage: npm run images -- <command>
  generate <preset> "<subject>" [--n 1-4]   N options → .images/review/ + manifest
  edit <file> "<change>"                     minimal edit pass on one option → .images/review/
  regenerate <manifest-id>                   rerun a manifest entry (same model, prompt, refs)
  refs                                       download the reference photos into the cache
  publish <file> --title "…" [--apply]       JPEG q85 → Directus; read-only without --apply`;

export type Command =
  | { command: "generate"; preset: string; subject: string; n: number }
  | { command: "edit"; file: string; change: string }
  | { command: "regenerate"; id: string }
  | { command: "refs" }
  | { command: "publish"; file: string; title: string; apply: boolean };

const VALUE_FLAGS = new Set(["n", "title"]);
const BOOLEAN_FLAGS = new Set(["apply"]);

/** argv after the script name, e.g. `["generate", "home-block", "…", "--n", "3"]`. */
export function parseArgs(argv: string[]): Command {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }
    const [name, value] = arg.slice(2).split(/=([\s\S]*)/);
    if (BOOLEAN_FLAGS.has(name) && value === undefined) {
      flags[name] = true;
    } else if (VALUE_FLAGS.has(name)) {
      const v = value ?? argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`--${name} needs a value`);
      flags[name] = v;
    } else {
      throw new Error(`unknown flag --${name}\n${USAGE}`);
    }
  }
  const [command, a, b] = positional;
  // On a malformed call, the command's own line of USAGE.
  const need = (ok: unknown) => {
    if (ok) return;
    const line = USAGE.split("\n").find((l) => l.trim().startsWith(`${command} `));
    throw new Error(`usage: npm run images -- ${line?.trim().split(/\s{2,}/)[0] ?? command}`);
  };

  switch (command) {
    case "generate": {
      need(a && b);
      const n = flags.n === undefined ? 1 : Number(flags.n);
      if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error("--n must be 1–4");
      return { command, preset: a, subject: b, n };
    }
    case "edit":
      need(a && b);
      return { command, file: a, change: b };
    case "regenerate":
      need(a);
      return { command, id: a };
    case "refs":
      return { command };
    case "publish":
      need(a && typeof flags.title === "string" && flags.title);
      return { command, file: a, title: flags.title as string, apply: flags.apply === true };
    default:
      throw new Error(`unknown command "${command ?? ""}"\n${USAGE}`);
  }
}

export interface ImageSize {
  width: number;
  height: number;
}

/** Pixel size from a PNG (IHDR) or JPEG (SOFn) header; null for any other format. */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const be32 = (i: number) => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: be32(16), height: be32(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length && bytes[i] === 0xff) {
      const marker = bytes[i + 1];
      // SOF0–SOF15, except DHT (C4), JPG (C8) and DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: be16(i + 7), height: be16(i + 5) };
      }
      i += 2 + be16(i + 2);
    }
  }
  return null;
}

/** "16:10" or "1.91:1" → width / height. */
function aspectRatio(aspect: string): number {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(aspect.trim());
  const ratio = match ? Number(match[1]) / Number(match[2]) : NaN;
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error(`aspect "${aspect}" is not W:H`);
  return ratio;
}

/** A warning when the image's ratio is more than 5% off the preset's aspect, null otherwise. */
export function aspectWarning({ width, height }: ImageSize, aspect: string): string | null {
  const expected = aspectRatio(aspect);
  const actual = width / height;
  const off = Math.abs(actual / expected - 1);
  if (off <= 0.05) return null;
  return (
    `${width}×${height} is ${actual.toFixed(2)}:1, ${Math.round(off * 100)}% off the preset's ` +
    `${aspect} (${expected.toFixed(2)}:1) — crop before publishing`
  );
}

/** Every AI image in Directus says so in its title. */
export function illustrationTitle(title: string): string {
  const t = title.trim();
  return t.toLowerCase().endsWith("(illustration)") ? t : `${t} (illustration)`;
}
