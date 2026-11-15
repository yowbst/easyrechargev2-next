/**
 * Image pipeline — the pure parts of `npm run images` (scripts/images.ts).
 *
 * Prompt building, preset resolution, the AI Gateway request/response shapes,
 * manifest entries and argument parsing. No network, no filesystem: the script
 * does the I/O. Runbook: docs/image-pipeline.md; house style:
 * docs/brand/image-style.md; config: brand/image-presets.json.
 */

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

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

/** `<label>-YYYYMMDD-HHMMSS-<n>.<ext>`, UTC. */
export function outputName(label: string, at: Date, index: number, ext: string): string {
  const stamp = at.toISOString().slice(0, 19).replace(/-|:/g, "").replace("T", "-");
  return `${label}-${stamp}-${index}.${ext}`;
}

export interface ManifestInput {
  kind: "generate" | "edit";
  at: Date;
  model: string;
  preset?: string;
  subject?: string;
  /** Edit pass: the requested change. */
  change?: string;
  prompt: string;
  refIds: string[];
  /** Edit pass: the image that was edited. */
  source?: string;
  cost: number | null;
  output: string;
}

export interface ManifestEntry {
  id: string;
  at: string;
  kind: "generate" | "edit";
  model: string;
  preset?: string;
  subject?: string;
  change?: string;
  prompt: string;
  refs: string[];
  source: string | null;
  cost: number | null;
  output: string;
  note?: string;
}

/** One line of brand/image-manifest.jsonl; the id is the output file name without extension. */
export function manifestEntry(input: ManifestInput): ManifestEntry {
  const base = input.output.split("/").pop() ?? input.output;
  return {
    id: base.replace(/\.[^.]+$/, ""),
    at: input.at.toISOString(),
    kind: input.kind,
    model: input.model,
    ...(input.preset !== undefined && { preset: input.preset }),
    ...(input.subject !== undefined && { subject: input.subject }),
    ...(input.change !== undefined && { change: input.change }),
    prompt: input.prompt,
    refs: input.refIds,
    source: input.source ?? null,
    cost: input.cost,
    output: input.output,
  };
}

export function findEntry(manifest: string, id: string): ManifestEntry {
  for (const line of manifest.split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line) as ManifestEntry;
    if (entry.id === id) return entry;
  }
  throw new Error(`no manifest entry "${id}"`);
}

export const USAGE = `usage: npm run images -- <command>
  generate <preset> "<subject>" [--n 1-4]   N options → .images/review/ + manifest
  edit <file> "<change>"                     minimal edit pass on one option
  regenerate <manifest-id>                   rerun a manifest entry (same model, prompt, refs)
  refs                                       download the reference photos into the cache
  publish <file> --title "…" [--dry-run]     JPEG q85 → Directus (only after Yoan's go)`;

export type Command =
  | { command: "generate"; preset: string; subject: string; n: number }
  | { command: "edit"; file: string; change: string }
  | { command: "regenerate"; id: string }
  | { command: "refs" }
  | { command: "publish"; file: string; title: string; dryRun: boolean };

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
    const [name, inline] = arg.slice(2).split(/=([\s\S]*)/);
    if (inline !== undefined) flags[name] = inline;
    else if (name === "dry-run") flags[name] = true;
    else flags[name] = argv[++i] ?? "";
  }
  const [command, a, b] = positional;
  const need = (ok: unknown, shape: string) => {
    if (!ok) throw new Error(`usage: npm run images -- ${shape}`);
  };

  switch (command) {
    case "generate": {
      need(a && b, `generate <preset> "<subject>" [--n 1-4]`);
      const n = flags.n === undefined ? 1 : Number(flags.n);
      if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error("--n must be 1–4");
      return { command, preset: a, subject: b, n };
    }
    case "edit":
      need(a && b, `edit <file> "<change>"`);
      return { command, file: a, change: b };
    case "regenerate":
      need(a, "regenerate <manifest-id>");
      return { command, id: a };
    case "refs":
      return { command };
    case "publish":
      need(a && typeof flags.title === "string" && flags.title, `publish <file> --title "…" [--dry-run]`);
      return { command, file: a, title: flags.title as string, dryRun: flags["dry-run"] === true };
    default:
      throw new Error(`unknown command "${command ?? ""}"\n${USAGE}`);
  }
}

/** Every AI image in Directus says so in its title. */
export function illustrationTitle(title: string): string {
  const t = title.trim();
  return t.endsWith("(illustration)") ? t : `${t} (illustration)`;
}
