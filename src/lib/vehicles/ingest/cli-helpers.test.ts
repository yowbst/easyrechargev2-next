import { describe, it, expect } from "vitest";
import { parseArgs, truncateList, diffBrandFields, validateFlags, parseMaxChangeRatio } from "./cli-helpers";

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
    expect(() => parseMaxChangeRatio("30")).toThrow(/\(0, 1\]/);
  });

  it("rejects zero", () => {
    expect(() => parseMaxChangeRatio("0")).toThrow(/\(0, 1\]/);
  });

  it("rejects a negative ratio", () => {
    expect(() => parseMaxChangeRatio("-0.5")).toThrow(/\(0, 1\]/);
  });
});
