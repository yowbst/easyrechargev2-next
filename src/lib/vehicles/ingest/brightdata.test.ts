import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerCollection, pollSnapshot } from "./brightdata";

const noSleep = async () => {};

beforeEach(() => {
  process.env.BRIGHTDATA_API_TOKEN = "test-token";
});
afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce({
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.body,
      text: async () => JSON.stringify(r.body),
    });
  }
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("triggerCollection", () => {
  it("returns the collection_id", async () => {
    mockFetch({ body: { collection_id: "j_abc123" } });
    expect(await triggerCollection("c_list", [{ page_size: 2000 }])).toBe("j_abc123");
  });

  it("targets the collector it was given", async () => {
    const fn = mockFetch({ body: { collection_id: "j_1" } });
    await triggerCollection("c_details", [{ car_url: "https://x" }]);
    expect(fn.mock.calls[0][0]).toContain("collector=c_details");
  });

  it("throws on 401 so an expired token fails loudly", async () => {
    mockFetch({ status: 401, body: "Token expired" });
    await expect(triggerCollection("c_list", [{}])).rejects.toThrow(/401/);
  });

  it("surfaces a 404 as a wrong-account or missing-collector error", async () => {
    mockFetch({ status: 404, body: "not found" });
    await expect(triggerCollection("c_gone", [{}])).rejects.toThrow(/404/);
  });
});

describe("pollSnapshot", () => {
  it("keeps polling while the body says building, then returns rows", async () => {
    const fn = mockFetch(
      { body: { status: "building" } },
      { body: { status: "building" } },
      { body: [{ evdb_id: 1 }, { evdb_id: 2 }] },
    );
    const rows = await pollSnapshot("j_abc", { sleep: noSleep });
    expect(rows).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not mistake a building body for data — the notebook's bug", async () => {
    const fn = mockFetch({ body: { status: "building" } }, { body: [{ evdb_id: 1 }] });
    const rows = await pollSnapshot("j_abc", { sleep: noSleep });
    expect(rows).toEqual([{ evdb_id: 1 }]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws once attempts are exhausted rather than returning junk", async () => {
    mockFetch(...Array.from({ length: 3 }, () => ({ body: { status: "building" } })));
    await expect(
      pollSnapshot("j_abc", { maxAttempts: 3, sleep: noSleep }),
    ).rejects.toThrow(/still building/i);
  });

  it("fails immediately on a non-array body with no status, instead of polling to exhaustion then misreporting 'still building'", async () => {
    const fn = mockFetch({ body: {} });
    await expect(pollSnapshot("j_abc", { maxAttempts: 120, sleep: noSleep })).rejects.toThrow(
      /unrecognised response shape/i,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fails immediately when status is present but empty", async () => {
    const fn = mockFetch({ body: { status: "" } });
    await expect(pollSnapshot("j_abc", { maxAttempts: 120, sleep: noSleep })).rejects.toThrow(
      /unrecognised response shape/i,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("truncates a large unexpected body instead of dumping it whole into the error", async () => {
    mockFetch({ body: { blob: "x".repeat(5000) } });
    await expect(pollSnapshot("j_abc", { sleep: noSleep })).rejects.toThrow(/…$/);
  });

  it("redacts the API token if it were ever echoed back in an unexpected body", async () => {
    mockFetch({ body: { message: "auth used test-token for this request" } });
    await expect(pollSnapshot("j_abc", { sleep: noSleep })).rejects.toThrow(
      /\[REDACTED\]/,
    );
  });
});
