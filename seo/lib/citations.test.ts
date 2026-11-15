import { describe, expect, it } from "vitest";
import { parsePrompts, summarizeSources } from "./citations";

describe("parsePrompts", () => {
  it("keeps numbered lines and ignores headings, prose and bullets", () => {
    const md = [
      "# Title",
      "Some prose about 3. things",
      "## Cost (P1-P10)",
      "1. Combien coûte une borne ?",
      "2. Quel prix pour une wallbox ?  ",
      "- 3. not a prompt",
      "10. Dixième question ?",
    ].join("\n");
    expect(parsePrompts(md)).toEqual([
      { id: 1, text: "Combien coûte une borne ?" },
      { id: 2, text: "Quel prix pour une wallbox ?" },
      { id: 10, text: "Dixième question ?" },
    ]);
  });

  it("finds all 30 prompts in the real file", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const md = readFileSync(resolve(__dirname, "../prompts/ai-citations-2026.md"), "utf-8");
    const prompts = parsePrompts(md);
    expect(prompts).toHaveLength(30);
    expect(prompts.map((p) => p.id)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe("summarizeSources", () => {
  it("ranks easyrecharge.ch among unique cited domains, ignoring www and subdomains", () => {
    const s = summarizeSources([
      { domain: "www.tcs.ch", url: "https://www.tcs.ch/a" },
      { domain: "tcs.ch", url: "https://tcs.ch/b" },
      { url: "https://www.easyrecharge.ch/fr/blog/x" },
      { domain: "suisseenergie.ch" },
    ]);
    expect(s).toEqual({ cited_domains: "tcs.ch, easyrecharge.ch, suisseenergie.ch", easyrecharge_cited: "yes", rank: 2 });
  });

  it("reports not cited, and survives missing or malformed sources", () => {
    expect(summarizeSources([{ domain: "tcs.ch" }])).toMatchObject({ easyrecharge_cited: "no", rank: "" });
    expect(summarizeSources(undefined)).toEqual({ cited_domains: "", easyrecharge_cited: "no", rank: "" });
    expect(summarizeSources([{ url: "not a url" }, {}]).easyrecharge_cited).toBe("no");
  });

  it("does not match a lookalike domain", () => {
    expect(summarizeSources([{ domain: "noteasyrecharge.ch" }]).easyrecharge_cited).toBe("no");
  });
});
