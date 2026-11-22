import { describe, expect, it } from "vitest";
import { describePurposes, parseDescribeResponse, SPECIALTIES, DESCRIBE_HEADER } from "./describe";
import { buildBatchPrompt, packItems } from "./batch";
import { MAX_KEYWORD_CHARS } from "./config";
import type { LlmCall } from "./client";
import type { DescriptionResult } from "../ingest/types";
import golden from "../ingest/__fixtures__/purposes-golden.json";

describe("parseDescribeResponse", () => {
  it("keeps known specialties in display order, at most four", () => {
    const text = JSON.stringify({ r: [{ i: 1, s: ["telecom", "bornes", "nonsense", "courant_fort", "domotique", "securite"], t: "Installations électriques et bornes." }] });
    const m = parseDescribeResponse(text, 1);
    expect(m.get(1)?.specialties).toEqual(["bornes", "courant_fort", "domotique", "telecom"]);
    expect(m.get(1)?.summary).toBe("Installations électriques et bornes");
  });

  it("accepts a missing specialty list and caps a long summary", () => {
    const m = parseDescribeResponse(JSON.stringify({ r: [{ i: 1, t: "x ".repeat(80) }] }), 1);
    expect(m.get(1)?.specialties).toEqual([]);
    expect(m.get(1)!.summary.length).toBeLessThanOrEqual(80);
  });

  it("drops out-of-range ids, duplicates and empty summaries", () => {
    const m = parseDescribeResponse(JSON.stringify({ r: [{ i: 1, t: "Ok ok" }, { i: 1, t: "dup" }, { i: 5, t: "range" }, { i: 2, t: " " }] }), 2);
    expect([...m.keys()]).toEqual([1]);
  });

  it("returns nothing for junk", () => {
    expect(parseDescribeResponse("sorry", 2).size).toBe(0);
  });
});

describe("describe prompts", () => {
  it("stay under the vendor keyword limit", () => {
    const items = golden.map((g) => ({ hash: g.id, name: g.name, purpose: g.purpose }));
    for (const b of packItems(items, DESCRIBE_HEADER)) expect(buildBatchPrompt(DESCRIBE_HEADER, b).length).toBeLessThanOrEqual(MAX_KEYWORD_CHARS);
  });

  it("name every specialty key the parser accepts", () => {
    for (const k of Object.keys(SPECIALTIES)) expect(DESCRIBE_HEADER).toContain(k);
  });
});

describe("describePurposes", () => {
  it("stores a versioned description per purpose", async () => {
    const map = new Map<string, DescriptionResult>();
    const call: LlmCall = async (p) => {
      const n = p.split("\n").filter((l) => /^\d+\|/.test(l)).length;
      return { text: JSON.stringify({ r: Array.from({ length: n }, (_, k) => ({ i: k + 1, s: ["courant_fort"], t: "Installations électriques" })) }), cost: 0.004, model: "m" };
    };
    const stats = await describePurposes([{ hash: "h1", name: "A", purpose: "installations électriques" }], {
      call, maxCost: 1, now: () => "T", cache: { get: (h) => map.get(h), set: (h, r) => void map.set(h, r) },
    });
    expect(stats.hits).toBe(1);
    expect(map.get("h1")).toEqual({ specialties: ["courant_fort"], trade_summary: "Installations électriques", described_model: "dataforseo-gemini:m:d1", described_at: "T", described_purpose_hash: "h1" });
  });
});
