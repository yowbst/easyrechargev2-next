import { describe, expect, it } from "vitest";
import { err, ok, run } from "./helpers";

describe("tool helpers", () => {
  it("ok wraps data as JSON text content", () => {
    const r = ok({ a: 1 });
    expect(r.content[0].type).toBe("text");
    expect(JSON.parse(r.content[0].text)).toEqual({ a: 1 });
    expect(r.isError).toBeUndefined();
  });

  it("err flags isError and carries a hint", () => {
    const r = err("boom", "try directus_collections");
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text)).toEqual({ error: "boom", hint: "try directus_collections" });
  });

  it("run catches thrown errors into err results", async () => {
    const good = await run(async () => ({ fine: true }));
    expect(good.isError).toBeUndefined();
    const bad = await run(async () => {
      throw new Error("directus exploded");
    }, "check the id");
    expect(bad.isError).toBe(true);
    expect(JSON.parse(bad.content[0].text).error).toContain("directus exploded");
  });
});
