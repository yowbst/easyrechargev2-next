import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { path: string; init?: { next?: { revalidate?: number } } }[] = [];
let response: unknown = null;
let fail = false;

vi.mock("@/lib/directus", () => ({
  directusFetch: vi.fn(async (path: string, init?: { next?: { revalidate?: number } }) => {
    calls.push({ path, init });
    if (fail) throw new Error("directus down");
    return response;
  }),
}));

import { getGlobalConfig, webhookUrl } from "./site-settings";

beforeEach(() => {
  calls.length = 0;
  fail = false;
  response = { data: { global_config: { webhooks: { quote: "https://hook/q", contact: "https://hook/c" } } } };
});

describe("getGlobalConfig", () => {
  it("reads the singleton uncached, without a status filter", async () => {
    await getGlobalConfig();
    expect(calls[0].path).toBe("/items/site_settings?fields=global_config");
    expect(calls[0].init?.next?.revalidate).toBe(0);
  });

  it("accepts the object or the one-element array Directus may return", async () => {
    expect((await getGlobalConfig()).webhooks).toEqual({ quote: "https://hook/q", contact: "https://hook/c" });
    response = { data: [{ global_config: { company: { name: "easyRecharge" } } }] };
    expect((await getGlobalConfig()).company).toEqual({ name: "easyRecharge" });
  });

  it("returns an empty config when Directus fails or has none, so each reader falls back to its defaults", async () => {
    response = { data: null };
    expect(await getGlobalConfig()).toEqual({});
    fail = true;
    expect(await getGlobalConfig()).toEqual({});
  });
});

describe("webhookUrl", () => {
  it("returns the configured URL, or null", async () => {
    expect(await webhookUrl("quote")).toBe("https://hook/q");
    expect(await webhookUrl("dispatch_events")).toBeNull();
  });
});
