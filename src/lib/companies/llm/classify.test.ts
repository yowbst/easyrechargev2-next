import { describe, expect, it } from "vitest";
import {
  buildClassifyPrompt,
  clipPurpose,
  classifyPurposes,
  evaluate,
  packBatches,
  parseClassifyResponse,
  type ClassifyItem,
} from "./classify";
import { LlmFatalError, type LlmCall } from "./client";
import { MAX_KEYWORD_CHARS } from "./config";
import type { ClassificationResult } from "../ingest/types";
import golden from "../ingest/__fixtures__/purposes-golden.json";

const item = (n: number, purpose = "installations électriques et téléphoniques"): ClassifyItem => ({
  hash: `h${n}`,
  name: `Company ${n}`,
  purpose,
});

describe("packBatches", () => {
  it("keeps every prompt under the vendor keyword limit, whatever the purposes look like", () => {
    const items = golden.map((g) => ({ hash: g.id, name: g.name, purpose: g.purpose }));
    const batches = packBatches(items);
    expect(batches.flat()).toHaveLength(items.length);
    for (const b of batches) expect(buildClassifyPrompt(b).length).toBeLessThanOrEqual(MAX_KEYWORD_CHARS);
    expect(batches.length).toBeGreaterThan(1);
  });

  it("packs several short purposes per call", () => {
    expect(packBatches(Array.from({ length: 20 }, (_, i) => item(i, "électricité"))).length).toBeLessThan(5);
  });

  it("never returns an empty batch and survives an enormous purpose", () => {
    const batches = packBatches([item(1, "x ".repeat(5000)), item(2)]);
    expect(batches.every((b) => b.length > 0)).toBe(true);
    expect(buildClassifyPrompt(batches[0]).length).toBeLessThanOrEqual(MAX_KEYWORD_CHARS);
  });

  it("returns nothing for nothing", () => {
    expect(packBatches([])).toEqual([]);
  });
});

describe("buildClassifyPrompt", () => {
  it("numbers companies from 1 and strips the field separator and newlines", () => {
    const p = buildClassifyPrompt([item(1, "a|b\nc"), item(2)]);
    expect(p).toContain("\n1|Company 1|a/b c");
    expect(p).toContain("\n2|Company 2|");
  });
});

describe("clipPurpose", () => {
  const filler = "Die Gesellschaft bezweckt den Handel mit Waren aller Art sowie die Beratung von Unternehmen. ".repeat(6);

  it("leaves a short purpose alone and strips the field separator", () => {
    expect(clipPurpose("installations électriques | dépannage")).toBe("installations électriques / dépannage");
  });

  it("cuts a long purpose at the start when the installer wording is already visible", () => {
    const p = "Ausführung aller elektrischen Installationen. " + filler;
    const c = clipPurpose(p);
    expect(c.startsWith("Ausführung aller elektrischen Installationen.")).toBe(true);
    expect(c.length).toBeLessThanOrEqual(235);
  });

  it("keeps the passage around installer wording that comes late", () => {
    const p = filler + "Ausserdem die Montage von Elektroinstallationen und Photovoltaikanlagen. " + filler;
    const c = clipPurpose(p);
    expect(c).toContain("Elektroinstallationen");
    expect(c.startsWith("Die Gesellschaft bezweckt")).toBe(true);
    expect(c.length).toBeLessThanOrEqual(240);
  });

  it("falls back to a plain cut when there is no installer wording at all", () => {
    expect(clipPurpose(filler).length).toBeLessThanOrEqual(235);
  });
});

describe("parseClassifyResponse", () => {
  const ok = '{"r":[{"i":1,"l":"installer","c":0.9,"w":"installe"},{"i":2,"l":"inspector","c":0.75,"w":"contrôle"}]}';

  it("parses plain JSON", () => {
    const m = parseClassifyResponse(ok, 2);
    expect(m.get(1)).toEqual({ label: "installer", confidence: 0.9, reason: "installe" });
    expect(m.get(2)?.label).toBe("inspector");
  });

  it("parses fenced JSON and JSON wrapped in prose", () => {
    expect(parseClassifyResponse("```json\n" + ok + "\n```", 2).size).toBe(2);
    expect(parseClassifyResponse("Voici le résultat:\n" + ok + "\nBonne journée", 2).size).toBe(2);
  });

  it("drops entries with unknown labels, out-of-range or duplicate ids, and bad numbers", () => {
    const text = JSON.stringify({
      r: [
        { i: 1, l: "installer", c: 0.9, w: "a" },
        { i: 1, l: "other", c: 0.5, w: "duplicate" },
        { i: 2, l: "electrician", c: 0.9, w: "bad label" },
        { i: 9, l: "other", c: 0.9, w: "out of range" },
        { i: 3, l: "planner", c: "high", w: "bad confidence" },
        "garbage",
      ],
    });
    const m = parseClassifyResponse(text, 3);
    expect([...m.keys()]).toEqual([1]);
    expect(m.get(1)?.reason).toBe("a");
  });

  it("clamps confidence, accepts numeric strings and caps the reason", () => {
    const m = parseClassifyResponse(JSON.stringify({ r: [{ i: "1", l: "OTHER", c: 7, w: "x".repeat(400) }] }), 1);
    expect(m.get(1)).toMatchObject({ label: "other", confidence: 1 });
    expect(m.get(1)?.reason).toHaveLength(255);
  });

  it("returns an empty map for anything that is not the expected JSON", () => {
    for (const bad of ["", "no json here", "{broken", '{"x":1}', '{"r":"nope"}']) {
      expect(parseClassifyResponse(bad, 3).size).toBe(0);
    }
  });
});

function memoryCache() {
  const map = new Map<string, ClassificationResult>();
  return { map, cache: { get: (h: string) => map.get(h), set: (h: string, r: ClassificationResult) => void map.set(h, r) } };
}

/** Answers every numbered line in the prompt with a fixed label. */
const stubLlm = (label = "installer", cost = 0.004): LlmCall & { prompts: string[] } => {
  const prompts: string[] = [];
  const call = (async (prompt: string) => {
    prompts.push(prompt);
    const n = prompt.split("\n").filter((l) => /^\d+\|/.test(l)).length;
    const r = Array.from({ length: n }, (_, k) => ({ i: k + 1, l: label, c: 0.9, w: "ok" }));
    return { text: JSON.stringify({ r }), cost, model: "stub" };
  }) as LlmCall & { prompts: string[] };
  call.prompts = prompts;
  return call;
};

describe("classifyPurposes", () => {
  it("classifies each distinct purpose once and caches the result", async () => {
    const { map, cache } = memoryCache();
    const call = stubLlm();
    const items = Array.from({ length: 10 }, (_, i) => item(i));
    const stats = await classifyPurposes(items, { call, cache, maxCost: 10, now: () => "T" });
    expect(stats).toMatchObject({ classified: 10, failed: 0, capped: false });
    expect(map.get("h3")).toMatchObject({
      classification: "installer",
      classification_confidence: 0.9,
      classified_purpose_hash: "h3",
      classified_at: "T",
      classification_model: "dataforseo-gemini:stub:v2",
    });
  });

  it("does not call the model for purposes already in the cache", async () => {
    const { cache } = memoryCache();
    const call = stubLlm();
    await classifyPurposes([item(1), item(2)], { call, cache, maxCost: 10 });
    const again = stubLlm();
    const stats = await classifyPurposes([item(1), item(2)], { call: again, cache, maxCost: 10 });
    expect(again.prompts).toHaveLength(0);
    expect(stats.calls).toBe(0);
  });

  it("retries items a reply skipped, once, in a fresh batch", async () => {
    const { map, cache } = memoryCache();
    let first = true;
    const call: LlmCall = async (prompt) => {
      const n = prompt.split("\n").filter((l) => /^\d+\|/.test(l)).length;
      const answered = first ? n - 1 : n; // the first reply forgets the last company
      first = false;
      const r = Array.from({ length: answered }, (_, k) => ({ i: k + 1, l: "other", c: 0.8, w: "" }));
      return { text: JSON.stringify({ r }), cost: 0.004, model: null };
    };
    const stats = await classifyPurposes([item(1), item(2), item(3)], { call, cache, maxCost: 10, concurrency: 1 });
    expect(stats.failed).toBe(0);
    expect(map.size).toBe(3);
    expect(stats.calls).toBe(2);
  });

  it("leaves items unclassified when the reply is never parseable, and counts the bad calls", async () => {
    const { map, cache } = memoryCache();
    const call: LlmCall = async () => ({ text: "Sorry, I cannot help with that.", cost: 0.004, model: null });
    const stats = await classifyPurposes([item(1), item(2)], { call, cache, maxCost: 10 });
    expect(map.size).toBe(0);
    expect(stats.failed).toBe(2);
    expect(stats.unparseableCalls).toBe(stats.calls);
  });

  it("stops at the spending cap and says so", async () => {
    const { map, cache } = memoryCache();
    const items = Array.from({ length: 40 }, (_, i) => item(i, "x".repeat(200)));
    const stats = await classifyPurposes(items, { call: stubLlm(), cache, maxCost: 0.01, concurrency: 1 });
    expect(stats.capped).toBe(true);
    expect(stats.spent).toBeLessThanOrEqual(0.01);
    expect(map.size).toBeLessThan(40);
    expect(stats.failed).toBe(40 - map.size);
  });

  it("aborts the run on an account error instead of burning the retry", async () => {
    const { cache } = memoryCache();
    const call: LlmCall = async () => {
      throw new LlmFatalError("40200 insufficient funds");
    };
    await expect(classifyPurposes([item(1)], { call, cache, maxCost: 10 })).rejects.toThrow(/insufficient funds/);
  });

  it("survives a transient failure and retries the batch", async () => {
    const { map, cache } = memoryCache();
    let calls = 0;
    const real = stubLlm();
    const call: LlmCall = async (p) => {
      if (++calls === 1) throw new Error("timeout");
      return real(p);
    };
    const stats = await classifyPurposes([item(1)], { call, cache, maxCost: 10, concurrency: 1 });
    expect(map.size).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.errors).toEqual({ timeout: 1 });
  });
});

describe("evaluate", () => {
  it("computes accuracy, the confusion matrix and the mistakes", () => {
    const g = [
      { id: "a", name: "A", purpose: "", expected: "installer" as const },
      { id: "b", name: "B", purpose: "", expected: "inspector" as const },
      { id: "c", name: "C", purpose: "", expected: "other" as const },
    ];
    const r = evaluate(g, new Map([["a", "installer"], ["b", "installer"], ["c", undefined]] as const));
    expect(r.correct).toBe(1);
    expect(r.accuracy).toBeCloseTo(1 / 3);
    expect(r.missing).toBe(1);
    expect(r.confusion).toEqual({ installer: { installer: 1 }, inspector: { installer: 1 }, other: { unclassified: 1 } });
    expect(r.mistakes.map((m) => m.id)).toEqual(["b", "c"]);
  });
});
