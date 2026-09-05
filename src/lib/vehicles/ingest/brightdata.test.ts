import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { triggerCollection, pollSnapshot, parseSnapshotBody } from "./brightdata";

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

// ---------------------------------------------------------------------------
// Regression tests from the first LIVE Bright Data run (2026-08-23).
// Every shape below is a verbatim capture from the real API. All three broke
// the original implementation: "collecting" threw, and a ready snapshot is
// NDJSON (1,405 lines) which res.json() cannot parse.
// ---------------------------------------------------------------------------
describe("parseSnapshotBody — real API shapes", () => {
  it('treats "collecting" as in progress (the original code threw here)', () => {
    const r = parseSnapshotBody('{"status":"collecting","message":"Job is not finished"}');
    expect(r).toEqual({ kind: "status", status: "collecting", message: "Job is not finished" });
  });

  it('treats "building" as in progress even with a message key alongside', () => {
    const r = parseSnapshotBody(
      '{"status":"building","message":"Dataset is not ready yet, try again in 30s"}',
    );
    expect(r.kind).toBe("status");
    expect((r as { status: string }).status).toBe("building");
  });

  it("parses a ready snapshot delivered as NDJSON, not a JSON array", () => {
    const ndjson = '{"evdb_id":3403,"car_url":"https://x/1"}\n{"evdb_id":3404,"car_url":"https://x/2"}';
    const r = parseSnapshotBody(ndjson);
    expect(r.kind).toBe("rows");
    expect((r as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("tolerates a blank trailing line in NDJSON", () => {
    const r = parseSnapshotBody('{"evdb_id":1,"car_url":"https://x/1"}\n\n');
    expect((r as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("treats a lone DETAILS row as data, not as a status envelope", () => {
    const r = parseSnapshotBody('{"vehicle":"{\\"car_url\\":\\"https://x/1\\"}","input":{}}');
    expect(r.kind).toBe("rows");
    expect((r as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("still accepts a plain JSON array", () => {
    const r = parseSnapshotBody('[{"evdb_id":1}]');
    expect((r as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it("reports an unrecognised body rather than guessing", () => {
    expect(parseSnapshotBody("").kind).toBe("unrecognised");
    expect(parseSnapshotBody("<html>nope</html>").kind).toBe("unrecognised");
  });
});

describe("pollSnapshot — live shapes end to end", () => {
  it('polls through "collecting" then "building" then returns NDJSON rows', async () => {
    const fn = vi.fn();
    for (const body of [
      '{"status":"collecting","message":"Job is not finished"}',
      '{"status":"building","message":"Dataset is not ready yet, try again in 30s"}',
      '{"evdb_id":3403,"car_url":"https://x/1"}\n{"evdb_id":3404,"car_url":"https://x/2"}',
    ]) {
      fn.mockResolvedValueOnce({ ok: true, status: 200, text: async () => body });
    }
    vi.stubGlobal("fetch", fn);

    const rows = await pollSnapshot("j_live", { sleep: async () => {} });
    expect(rows).toHaveLength(2);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws on a terminal status instead of polling to exhaustion", async () => {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{"status":"failed","message":"boom"}',
    });
    vi.stubGlobal("fetch", fn);
    await expect(pollSnapshot("j_bad", { sleep: async () => {} })).rejects.toThrow(/failed.*boom/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
