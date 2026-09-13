import { describe, it, expect } from "vitest";
import {
  parseArgs,
  truncateList,
  diffBrandFields,
  validateFlags,
  parseMaxChangeRatio,
  partitionUnmatched,
  pickScrapeTargets,
  parseLimit,
} from "./cli-helpers";

describe("parseArgs", () => {
  it("reads the command as the first positional arg", () => {
    const { command } = parseArgs(["plan", "--in", "foo.json"]);
    expect(command).toBe("plan");
  });

  it("is undefined when no args are given", () => {
    const { command } = parseArgs([]);
    expect(command).toBeUndefined();
  });

  it("flag() returns the value following --name", () => {
    const { flag } = parseArgs(["plan", "--in", "foo.json", "--max-change-ratio", "0.5"]);
    expect(flag("in")).toBe("foo.json");
    expect(flag("max-change-ratio")).toBe("0.5");
  });

  it("flag() returns undefined when the flag is absent", () => {
    const { flag } = parseArgs(["plan"]);
    expect(flag("in")).toBeUndefined();
  });

  it("has() detects boolean flags regardless of position", () => {
    const { has } = parseArgs(["apply", "--plan", "x.json", "--dry-run"]);
    expect(has("dry-run")).toBe(true);
    expect(has("verbose")).toBe(false);
  });
});

describe("truncateList", () => {
  it("returns everything and no hidden count when under the cap", () => {
    const { shown, hiddenCount } = truncateList([1, 2, 3], 10);
    expect(shown).toEqual([1, 2, 3]);
    expect(hiddenCount).toBe(0);
  });

  it("caps at max and reports the remainder", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const { shown, hiddenCount } = truncateList(items, 10);
    expect(shown).toHaveLength(10);
    expect(shown).toEqual(items.slice(0, 10));
    expect(hiddenCount).toBe(15);
  });

  it("defaults to a max of 10", () => {
    const items = Array.from({ length: 12 }, (_, i) => i);
    const { shown, hiddenCount } = truncateList(items);
    expect(shown).toHaveLength(10);
    expect(hiddenCount).toBe(2);
  });

  it("handles an empty list", () => {
    const { shown, hiddenCount } = truncateList([]);
    expect(shown).toEqual([]);
    expect(hiddenCount).toBe(0);
  });
});

describe("diffBrandFields", () => {
  it("returns an empty object when nothing changed", () => {
    const existing = { id: "1", name: "Abarth", active_models: 2 };
    const candidate = { name: "Abarth", active_models: 2 };
    expect(diffBrandFields(existing, candidate)).toEqual({});
  });

  it("returns only the fields that differ", () => {
    const existing = { id: "1", name: "Abarth", active_models: 2 };
    const candidate = { name: "Abarth", active_models: 3 };
    expect(diffBrandFields(existing, candidate)).toEqual({ active_models: 3 });
  });

  it("returns all candidate fields when the row doesn't exist yet", () => {
    const existing = {};
    const candidate = { name: "New Make", active_models: 1 };
    expect(diffBrandFields(existing, candidate)).toEqual({ name: "New Make", active_models: 1 });
  });

  it("ignores keys only present on the existing row", () => {
    const existing = { id: "1", name: "Abarth", active_models: 2, slug: "abarth" };
    const candidate = { name: "Abarth", active_models: 2 };
    expect(diffBrandFields(existing, candidate)).toEqual({});
  });
});

describe("validateFlags", () => {
  it("accepts known flags for a command", () => {
    expect(() => validateFlags("plan", ["plan", "--in", "foo.json"])).not.toThrow();
    expect(() =>
      validateFlags("apply", ["apply", "--plan", "x.json", "--dry-run"]),
    ).not.toThrow();
  });

  it("accepts flags in either order", () => {
    expect(() =>
      validateFlags("apply", ["apply", "--dry-run", "--plan", "x.json"]),
    ).not.toThrow();
  });

  it("rejects a typo'd flag instead of silently ignoring it (the --dryrun case)", () => {
    // Missing hyphen: brands would otherwise run for real instead of previewing,
    // and the runbook calls --dry-run "the only chance to catch a bad create/update".
    expect(() =>
      validateFlags("brands", ["brands", "--in", "foo.json", "--dryrun"]),
    ).toThrow(/unknown flag "--dryrun"/i);
  });

  it("names the valid flags for the command in the error", () => {
    expect(() => validateFlags("brands", ["brands", "--bogus"])).toThrow(/--in|--dry-run/);
  });

  it("rejects a flag that isn't valid for this command even if valid for another", () => {
    // --limit only exists for scrape.
    expect(() => validateFlags("plan", ["plan", "--in", "foo.json", "--limit", "5"])).toThrow(
      /unknown flag "--limit"/i,
    );
  });

  it("always allows --help regardless of command", () => {
    expect(() => validateFlags("plan", ["plan", "--in", "foo.json", "--help"])).not.toThrow();
  });

  it("rejects a value-taking flag with no value at the end of argv", () => {
    expect(() => validateFlags("plan", ["plan", "--in"])).toThrow(/--in requires a value/i);
  });

  it("rejects a value-taking flag whose value is actually another flag, rather than silently accepting it", () => {
    // --in --dry-run must be reported as a missing value for --in, not as
    // --in="--dry-run" (a nonsense filename) silently accepted.
    expect(() => validateFlags("brands", ["brands", "--in", "--dry-run"])).toThrow(
      /--in requires a value/i,
    );
  });

  it("does not consume a boolean flag's own token as if it were a value", () => {
    // --dry-run --plan x.json: --dry-run takes no value, so --plan must still
    // be recognised as its own flag, not skipped over.
    expect(() =>
      validateFlags("apply", ["apply", "--dry-run", "--plan", "x.json"]),
    ).not.toThrow();
  });
});

describe("parseMaxChangeRatio", () => {
  it("returns undefined when the flag was not passed", () => {
    expect(parseMaxChangeRatio(undefined)).toBeUndefined();
  });

  it("parses a valid fraction", () => {
    expect(parseMaxChangeRatio("0.5")).toBe(0.5);
  });

  it("accepts the upper boundary of 1", () => {
    expect(parseMaxChangeRatio("1")).toBe(1);
  });

  it("rejects non-numeric input instead of silently disarming the breaker", () => {
    expect(() => parseMaxChangeRatio("abc")).toThrow(/finite number/i);
  });

  it("rejects a value typed as a percentage instead of a fraction (30 meaning 30%)", () => {
    expect(() => parseMaxChangeRatio("30")).toThrow(/\(0, 10\]/);
  });

  it("rejects zero", () => {
    expect(() => parseMaxChangeRatio("0")).toThrow(/\(0, 10\]/);
  });

  it("rejects a negative ratio", () => {
    expect(() => parseMaxChangeRatio("-0.5")).toThrow(/\(0, 10\]/);
  });
});

describe("partitionUnmatched", () => {
  it("attributes rows never submitted to DETAILS to the limit, not to a failure", () => {
    // The real shape of a --limit 2 run: 2 targeted, the rest untouched.
    const targets = ["https://x/1", "https://x/2"];
    const unmatched = ["https://x/3", "https://x/4", "https://x/5"];
    const { skippedByLimit, unresolved } = partitionUnmatched(unmatched, targets);

    expect(skippedByLimit).toEqual(unmatched);
    expect(unresolved).toEqual([]);
  });

  it("keeps a scraped-but-unmatched row as a genuine problem", () => {
    const { skippedByLimit, unresolved } = partitionUnmatched(
      ["https://x/1"],
      ["https://x/1", "https://x/2"],
    );
    expect(skippedByLimit).toEqual([]);
    expect(unresolved).toEqual(["https://x/1"]);
  });

  it("separates the two causes in a single run", () => {
    const { skippedByLimit, unresolved } = partitionUnmatched(
      ["https://x/1", "https://x/9"],
      ["https://x/1", "https://x/2"],
    );
    expect(unresolved).toEqual(["https://x/1"]);
    expect(skippedByLimit).toEqual(["https://x/9"]);
  });

  it("never blames the limit for a row that has no car_url at all", () => {
    const { skippedByLimit, unresolved } = partitionUnmatched([""], ["https://x/1"]);
    expect(skippedByLimit).toEqual([]);
    expect(unresolved).toEqual(["(row with no car_url)"]);
  });

  it("reports everything as unresolved when no limit was applied", () => {
    // Without --limit, targets covers every URL, so nothing can be excused.
    const all = ["https://x/1", "https://x/2"];
    const { skippedByLimit, unresolved } = partitionUnmatched(["https://x/2"], all);
    expect(skippedByLimit).toEqual([]);
    expect(unresolved).toEqual(["https://x/2"]);
  });

  it("returns two empty lists when nothing was dropped", () => {
    expect(partitionUnmatched([], ["https://x/1"])).toEqual({
      skippedByLimit: [],
      unresolved: [],
    });
  });
});

describe("parseMaxChangeRatio — ratios above 1", () => {
  it("accepts a ratio above 1, which a large refresh legitimately produces", () => {
    // Measured live 2026-09-13: 268 creates + 388 updates on 562 records = 117%.
    expect(parseMaxChangeRatio("1.2")).toBe(1.2);
    expect(parseMaxChangeRatio("2")).toBe(2);
  });

  it("still rejects a percentage typed as a percentage", () => {
    expect(() => parseMaxChangeRatio("30")).toThrow(/not a percentage/);
    expect(() => parseMaxChangeRatio("120")).toThrow(/not a percentage/);
  });

  it("still rejects nonsense and non-positive values", () => {
    expect(() => parseMaxChangeRatio("abc")).toThrow();
    expect(() => parseMaxChangeRatio("0")).toThrow();
    expect(() => parseMaxChangeRatio("-1")).toThrow();
  });
});

describe("pickScrapeTargets", () => {
  const rows = [
    { car_url: "https://x/1", availability: "Available to order" },
    { car_url: "https://x/2", availability: "Discontinued" },
    { car_url: "https://x/3", availability: "Available to order" },
  ];
  const isAvail = (r: (typeof rows)[number]) => r.availability === "Available to order";

  it("keeps only available vehicles by default", () => {
    expect(pickScrapeTargets(rows, isAvail).map((r) => r.car_url)).toEqual([
      "https://x/1",
      "https://x/3",
    ]);
  });

  it("ignores availability entirely when an explicit set is given", () => {
    // This is the repair path: a discontinued vehicle must be reachable.
    const only = new Set(["https://x/2"]);
    expect(pickScrapeTargets(rows, isAvail, only).map((r) => r.car_url)).toEqual(["https://x/2"]);
  });

  it("silently skips requested urls absent from the listing", () => {
    const only = new Set(["https://x/2", "https://x/999"]);
    expect(pickScrapeTargets(rows, isAvail, only)).toHaveLength(1);
  });

  it("returns nothing for an empty explicit set rather than falling back to availability", () => {
    expect(pickScrapeTargets(rows, isAvail, new Set())).toEqual([]);
  });
});

describe("images command flags", () => {
  it("accepts its three flags", () => {
    expect(() =>
      validateFlags("images", ["images", "--status", "draft", "--limit", "5", "--dry-run"]),
    ).not.toThrow();
  });

  it("rejects an unknown flag rather than ignoring it", () => {
    expect(() => validateFlags("images", ["images", "--statuss", "draft"])).toThrow(/Unknown flag/);
  });
});

describe("parseLimit", () => {
  it("returns undefined when the flag is absent", () => {
    expect(parseLimit(undefined)).toBeUndefined();
  });

  it("accepts a whole positive number", () => {
    expect(parseLimit("5")).toBe(5);
  });

  it("rejects a fraction rather than silently flooring it", () => {
    // slice(0, 2.5) takes 2 without a word. The operator asked for a number
    // the command cannot honour; say so instead of guessing.
    expect(() => parseLimit("2.5")).toThrow(/whole number/);
  });

  it("rejects a non-number rather than slicing to nothing", () => {
    // Number("abc") is NaN and slice(0, NaN) is empty: the run would do zero
    // work and report no error at all.
    expect(() => parseLimit("abc")).toThrow(/whole number/);
  });

  it("rejects zero and negatives", () => {
    expect(() => parseLimit("0")).toThrow(/greater than zero/);
    expect(() => parseLimit("-3")).toThrow(/greater than zero/);
  });

  it("names the value it rejected", () => {
    expect(() => parseLimit("2.5")).toThrow(/"2\.5"/);
  });
});
