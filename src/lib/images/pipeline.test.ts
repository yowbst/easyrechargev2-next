import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import shipped from "../../../brand/image-presets.json";

const shippedManifest = readFileSync(join(__dirname, "../../../brand/image-manifest.jsonl"), "utf8");
import {
  apiError,
  aspectWarning,
  buildChatBody,
  buildEditPrompt,
  buildGatewayRequest,
  buildPrompt,
  findEntry,
  parseGatewayResponse,
  illustrationTitle,
  imageSize,
  manifestEntry,
  outputName,
  parseArgs,
  parseChatResponse,
  resolvePreset,
  type ImageConfig,
} from "./pipeline";

// The 2026-11-15 battery generation, verbatim: the regression the pipeline must reproduce.
const BATTERY_SUBJECT =
  "Inside a clean private garage with bare concrete walls: a slim white home battery storage cabinet and a compact solar inverter are neatly wall-mounted on the right, cables in a tidy grey conduit, a matte black wall-mounted EV charger beside them. The wide garage door on the left is open onto a Swiss house whose roof is covered with black solar panels, green hills behind, early morning sun.";
const BATTERY_PROMPT =
  "The three attached photographs define our brand's photographic style: light, palette, materials, framing and mood. Create a NEW photograph in exactly that style (do not copy their content). " +
  BATTERY_SUBJECT +
  " Documentary architectural photograph, eye level, 35mm lens, natural soft morning light, muted palette of raw concrete grey, warm oak wood and deep greens, Swiss residential setting, calm and tidy, realistic materials, no people, no text, no lettering, no brand logos, landscape 16:10 framing.";

const STYLE =
  "Documentary architectural photograph, eye level, 35mm lens, natural soft morning light, muted palette of raw concrete grey, warm oak wood and deep greens, Swiss residential setting, calm and tidy, realistic materials, no people, no text, no lettering, no brand logos";

describe("buildPrompt", () => {
  it("reproduces the 2026-11-15 battery prompt from style + home-block framing + subject", () => {
    expect(
      buildPrompt({ style: STYLE, framing: "landscape 16:10 framing", subject: BATTERY_SUBJECT, refCount: 3 }),
    ).toBe(BATTERY_PROMPT);
  });

  it("still reproduces it from the shipped style and framing with the entry's three refs", () => {
    const preset = resolvePreset(shipped as ImageConfig, "home-block");
    expect(preset.model).toBe("google/gemini-3.1-flash-image");
    expect(buildPrompt({ ...preset, subject: BATTERY_SUBJECT, refCount: 3 })).toBe(BATTERY_PROMPT);
  });

  it("states how many photographs the shipped reference set attaches (PPE car park included)", () => {
    const preset = resolvePreset(shipped as ImageConfig, "home-block");
    expect(preset.refIds).toContain("b8b2addb-273c-4aa4-88c3-b25e31cc6e10");
    expect(buildPrompt({ ...preset, subject: "x", refCount: preset.refIds.length })).toMatch(
      /^The four attached photographs define/,
    );
  });

  it("speaks of one photograph in the singular", () => {
    expect(buildPrompt({ style: "s", framing: "f", subject: "x", refCount: 1 })).toMatch(
      /^The one attached photograph defines/,
    );
  });
});

const CONFIG: ImageConfig = {
  model: "google/gemini-3.1-flash-image",
  style: STYLE,
  refs: [
    { id: "475a06f4-9320-4452-b5ce-595a05726781", label: "hero, dawn driveway" },
    { id: "6d4a6a91-7eaa-451f-9de8-fafe66427a79", label: "La borne" },
  ],
  presets: {
    "home-block": { aspect: "16:10", framing: "landscape 16:10 framing" },
    "blog-cover": { aspect: "16:9", framing: "landscape 16:9 framing", model: "openai/gpt-image-2" },
  },
};

describe("resolvePreset", () => {
  it("fills the default model and carries the shared style and refs", () => {
    expect(resolvePreset(CONFIG, "home-block")).toEqual({
      name: "home-block",
      model: "google/gemini-3.1-flash-image",
      aspect: "16:10",
      framing: "landscape 16:10 framing",
      style: STYLE,
      refIds: ["475a06f4-9320-4452-b5ce-595a05726781", "6d4a6a91-7eaa-451f-9de8-fafe66427a79"],
    });
  });

  it("lets a preset override the model", () => {
    expect(resolvePreset(CONFIG, "blog-cover").model).toBe("openai/gpt-image-2");
  });

  it("names the known presets when the requested one does not exist", () => {
    expect(() => resolvePreset(CONFIG, "hero")).toThrow(/unknown preset "hero".*home-block, blog-cover/);
  });
});

describe("buildChatBody", () => {
  it("sends the text first, then each reference as a data URL", () => {
    const body = buildChatBody("google/gemini-3.1-flash-image", "a garage", [
      { mime: "image/jpeg", base64: "AAA" },
      { mime: "image/png", base64: "BBB" },
    ]);
    expect(body).toEqual({
      model: "google/gemini-3.1-flash-image",
      modalities: ["text", "image"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "a garage" },
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } },
            { type: "image_url", image_url: { url: "data:image/png;base64,BBB" } },
          ],
        },
      ],
    });
  });
});

describe("buildGatewayRequest", () => {
  const ref = { mime: "image/jpeg", base64: "AAA" };

  it("sends chat image models (google/…) to chat completions", () => {
    const req = buildGatewayRequest("google/gemini-3.1-flash-image", "a garage", [ref], "16:10");
    expect(req.path).toBe("/v1/chat/completions");
    expect(req.body).toEqual(buildChatBody("google/gemini-3.1-flash-image", "a garage", [ref]));
  });

  it("sends image-only models with references to /v1/images/edits as JSON data URLs", () => {
    expect(buildGatewayRequest("openai/gpt-image-2", "a garage", [ref, { mime: "image/png", base64: "BBB" }], "16:10")).toEqual({
      path: "/v1/images/edits",
      body: {
        model: "openai/gpt-image-2",
        prompt: "a garage",
        images: [{ image_url: "data:image/jpeg;base64,AAA" }, { image_url: "data:image/png;base64,BBB" }],
        n: 1,
      },
    });
  });

  it("sends image-only models without references to /v1/images/generations, sized from the aspect", () => {
    expect(buildGatewayRequest("bfl/flux-2-pro", "a garage", [], "16:9")).toEqual({
      path: "/v1/images/generations",
      body: { model: "bfl/flux-2-pro", prompt: "a garage", n: 1, size: "1536x1024" },
    });
    expect(buildGatewayRequest("openai/gpt-image-2", "x", [], "1:1").body).toMatchObject({ size: "1024x1024" });
    expect(buildGatewayRequest("openai/gpt-image-2", "x", [], "2:3").body).toMatchObject({ size: "1024x1536" });
  });

  it("needs an aspect only to size a generation without references", () => {
    expect(buildGatewayRequest("openai/gpt-image-2", "x", [ref]).path).toBe("/v1/images/edits");
    expect(() => buildGatewayRequest("openai/gpt-image-2", "x", [])).toThrow(/needs the preset's aspect/);
  });
});

describe("parseGatewayResponse", () => {
  it("reads an images-API answer from data[0].b64_json, its format from the bytes, and usage.cost", () => {
    const b64 = Buffer.from(PNG_1536x1024).toString("base64");
    const result = parseGatewayResponse("openai/gpt-image-2", { data: [{ b64_json: b64 }], usage: { cost: 0.19 } });
    expect(result.ext).toBe("png");
    expect(Array.from(result.bytes)).toEqual(Array.from(PNG_1536x1024));
    expect(result.cost).toBe(0.19);
  });

  it("reports a null cost when the images API does not give one", () => {
    const b64 = Buffer.from(JPEG_1344x768).toString("base64");
    const result = parseGatewayResponse("openai/gpt-image-2", { data: [{ b64_json: b64 }] });
    expect(result).toMatchObject({ ext: "jpg", cost: null });
  });

  it("fails clearly when the images API returns no image", () => {
    expect(() => parseGatewayResponse("openai/gpt-image-2", { data: [] })).toThrow(/no image in the response/);
  });

  it("reads chat models the chat way", () => {
    const result = parseGatewayResponse("google/gemini-3.1-flash-image", {
      choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,aGVsbG8=" } }] } }],
    });
    expect(Buffer.from(result.bytes).toString()).toBe("hello");
  });
});

describe("apiError", () => {
  it("names the call and the status, and cuts any body to 500 characters", () => {
    expect(apiError("AI Gateway", 402, "budget exceeded").message).toBe("AI Gateway 402: budget exceeded");
    const long = apiError("Directus POST /files", 500, "x".repeat(2000)).message;
    expect(long).toBe(`Directus POST /files 500: ${"x".repeat(500)}…`);
  });
});

describe("parseChatResponse", () => {
  it("returns the image bytes, its extension and the real cost", () => {
    const result = parseChatResponse({
      choices: [{ message: { content: "", images: [{ image_url: { url: "data:image/png;base64,aGVsbG8=" } }] } }],
      usage: { cost: 0.0672 },
    });
    expect(result.ext).toBe("png");
    expect(Buffer.from(result.bytes).toString()).toBe("hello");
    expect(result.cost).toBe(0.0672);
  });

  it("reports the model's text when no image came back", () => {
    expect(() =>
      parseChatResponse({ choices: [{ message: { content: "I can't draw that." } }] }),
    ).toThrow(/no image.*I can't draw that\./);
  });
});

describe("outputName", () => {
  it("stamps the label with the UTC time and the option number", () => {
    expect(outputName("home-block", new Date("2026-11-15T09:05:07Z"), 2, "png")).toBe(
      "home-block-20261115-090507-2.png",
    );
  });
});

describe("manifestEntry", () => {
  it("records everything needed to regenerate the image, keyed by the file name", () => {
    expect(
      manifestEntry({
        kind: "generate",
        at: new Date("2026-11-15T09:05:07Z"),
        model: "google/gemini-3.1-flash-image",
        preset: "home-block",
        subject: "a garage",
        prompt: "full prompt",
        refIds: ["475a06f4-9320-4452-b5ce-595a05726781"],
        cost: 0.0672,
        width: 1344,
        height: 768,
        output: ".images/review/home-block-20261115-090507-1.png",
      }),
    ).toEqual({
      id: "home-block-20261115-090507-1",
      at: "2026-11-15T09:05:07.000Z",
      kind: "generate",
      model: "google/gemini-3.1-flash-image",
      preset: "home-block",
      subject: "a garage",
      prompt: "full prompt",
      refIds: ["475a06f4-9320-4452-b5ce-595a05726781"],
      source: null,
      cost: 0.0672,
      width: 1344,
      height: 768,
      output: ".images/review/home-block-20261115-090507-1.png",
    });
  });
});

describe("findEntry", () => {
  const manifest =
    '{"id":"a","kind":"generate"}\n\n{"id":"battery-2026-11-15","kind":"generate","prompt":"p"}\n';

  it("finds an entry of the JSON-lines manifest by id", () => {
    expect(findEntry(manifest, "battery-2026-11-15")).toMatchObject({ prompt: "p" });
  });

  it("fails loudly on an unknown id", () => {
    expect(() => findEntry(manifest, "nope")).toThrow(/no manifest entry "nope"/);
  });

  it("names the line when the manifest is not valid JSON lines", () => {
    expect(() => findEntry('{"id":"a"}\n{oops\n', "b")).toThrow(/image-manifest\.jsonl line 2 is not valid JSON/);
  });

  it("keeps the hand-made battery entry regenerable: its prompt, refs and a note, but no output file", () => {
    const entry = findEntry(shippedManifest, "battery-2026-11-15");
    expect(entry.output).toBeNull();
    expect(entry.note).toMatch(/by hand/);
    expect(entry.prompt).toBe(BATTERY_PROMPT);
    expect(entry.refIds).toHaveLength(3);
  });
});

describe("parseArgs", () => {
  it("parses generate with a quoted subject and --n", () => {
    expect(parseArgs(["generate", "home-block", "a quiet garage", "--n", "3"])).toEqual({
      command: "generate",
      preset: "home-block",
      subject: "a quiet garage",
      n: 3,
    });
    expect(parseArgs(["generate", "hero", "x", "--n=2"])).toMatchObject({ n: 2 });
  });

  it("generates one option by default", () => {
    expect(parseArgs(["generate", "hero", "x"])).toMatchObject({ n: 1 });
  });

  it("caps --n at 4 options", () => {
    expect(() => parseArgs(["generate", "hero", "x", "--n", "9"])).toThrow(/--n must be 1–4/);
    expect(() => parseArgs(["generate", "hero", "x", "--n", "two"])).toThrow(/--n must be 1–4/);
  });

  it("requires both a preset and a subject for generate", () => {
    expect(() => parseArgs(["generate", "hero"])).toThrow(/usage: .*generate <preset> "<subject>"/);
  });

  it("parses edit and regenerate", () => {
    expect(parseArgs(["edit", ".images/review/a.png", "remove the cable"])).toEqual({
      command: "edit",
      file: ".images/review/a.png",
      change: "remove the cable",
    });
    expect(parseArgs(["regenerate", "battery-2026-11-15"])).toEqual({
      command: "regenerate",
      id: "battery-2026-11-15",
    });
  });

  it("parses publish as read-only unless --apply is given", () => {
    expect(parseArgs(["publish", "a.png", "--title", "Batterie au garage"])).toEqual({
      command: "publish",
      file: "a.png",
      title: "Batterie au garage",
      apply: false,
    });
    expect(parseArgs(["publish", "a.png", "--title", "Batterie au garage", "--apply"])).toMatchObject({ apply: true });
    expect(parseArgs(["publish", "a.png", "--apply", "--title=Batterie"])).toMatchObject({ apply: true, title: "Batterie" });
  });

  it("refuses a flag value that is itself a flag", () => {
    expect(() => parseArgs(["publish", "a.png", "--title", "--apply"])).toThrow(/--title needs a value/);
    expect(() => parseArgs(["generate", "hero", "x", "--n", "--apply"])).toThrow(/--n needs a value/);
    expect(() => parseArgs(["publish", "a.png", "--title"])).toThrow(/--title needs a value/);
  });

  it("rejects unknown flags, including the old --dry-run", () => {
    expect(() => parseArgs(["publish", "a.png", "--title", "T", "--dry-run"])).toThrow(/unknown flag --dry-run/);
  });

  it("refuses to publish without a title", () => {
    expect(() => parseArgs(["publish", "a.png"])).toThrow(/--title/);
  });

  it("rejects an unknown command", () => {
    expect(() => parseArgs(["paint"])).toThrow(/unknown command "paint"/);
  });
});

describe("buildEditPrompt", () => {
  it("asks for one minimal change and keeps the rest of the photograph intact", () => {
    expect(buildEditPrompt("Remove the second cable on the left wall.")).toBe(
      "Edit the attached photograph with one minimal change: Remove the second cable on the left wall. " +
        "Keep everything else identical: composition, framing, light, colours, materials and style. " +
        "No people, no text, no lettering, no brand logos.",
    );
  });

  it("closes a change written without a final full stop", () => {
    expect(buildEditPrompt("remove the cable")).toMatch(/change: remove the cable\. Keep/);
  });
});

describe("illustrationTitle", () => {
  it("ends every Directus title with (illustration), once", () => {
    expect(illustrationTitle("Batterie au garage")).toBe("Batterie au garage (illustration)");
    expect(illustrationTitle("Batterie au garage (illustration)")).toBe("Batterie au garage (illustration)");
  });

  it("recognises the suffix whatever its case", () => {
    expect(illustrationTitle("Batterie au garage (Illustration)")).toBe("Batterie au garage (Illustration)");
    expect(illustrationTitle("Batterie (ILLUSTRATION) ")).toBe("Batterie (ILLUSTRATION)");
  });
});

// Smallest headers that carry the size: PNG signature + IHDR, JPEG SOI + APP0 + SOF0.
const PNG_1536x1024 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0x06, 0x00, 0, 0, 0x04, 0x00, 8, 6, 0, 0, 0,
]);
const JPEG_1344x768 = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 4, 0x4a, 0x46, 0xff, 0xc0, 0, 11, 8, 0x03, 0x00, 0x05, 0x40, 3, 1, 0x22, 0,
]);

describe("imageSize", () => {
  it("reads the pixel size of a PNG and of a JPEG", () => {
    expect(imageSize(PNG_1536x1024)).toEqual({ width: 1536, height: 1024 });
    expect(imageSize(JPEG_1344x768)).toEqual({ width: 1344, height: 768 });
  });

  it("returns null for a format it does not parse", () => {
    expect(imageSize(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBeNull();
  });
});

describe("aspectWarning", () => {
  it("stays quiet within 5% of the preset's aspect", () => {
    expect(aspectWarning({ width: 1600, height: 1000 }, "16:10")).toBeNull();
    expect(aspectWarning({ width: 1344, height: 768 }, "16:9")).toBeNull(); // 1.75 vs 1.778: 1.6% off
    expect(aspectWarning({ width: 1200, height: 630 }, "1.91:1")).toBeNull();
  });

  it("warns, with both ratios, when the image is more than 5% off", () => {
    // 1536×1024 = 1.5, 6.25% below 16:10.
    expect(aspectWarning({ width: 1536, height: 1024 }, "16:10")).toBe(
      "1536×1024 is 1.50:1, 6% off the preset's 16:10 (1.60:1) — crop before publishing",
    );
    expect(aspectWarning({ width: 1024, height: 1024 }, "16:9")).toMatch(/44% off the preset's 16:9/);
  });

  it("rejects an aspect it cannot read", () => {
    expect(() => aspectWarning({ width: 1, height: 1 }, "wide")).toThrow(/aspect "wide"/);
  });
});
