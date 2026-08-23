import { describe, it, expect } from "vitest";
import { parseArgs, truncateList, diffBrandFields } from "./cli-helpers";

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
