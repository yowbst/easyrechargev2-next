import { describe, expect, it } from "vitest";
import shipped from "../../../brand/image-presets.json";
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

  it("still reproduces it from the shipped brand/image-presets.json", () => {
    const preset = resolvePreset(shipped as ImageConfig, "home-block");
    expect(preset.model).toBe("google/gemini-3.1-flash-image");
    expect(buildPrompt({ ...preset, subject: BATTERY_SUBJECT, refCount: preset.refIds.length })).toBe(
      BATTERY_PROMPT,
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
      refs: ["475a06f4-9320-4452-b5ce-595a05726781"],
      source: null,
      cost: 0.0672,
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

  it("parses publish, with the title and the dry-run flag", () => {
    expect(parseArgs(["publish", "a.png", "--title", "Batterie au garage", "--dry-run"])).toEqual({
      command: "publish",
      file: "a.png",
      title: "Batterie au garage",
      dryRun: true,
    });
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
});
