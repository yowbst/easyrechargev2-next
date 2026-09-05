import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  process.env.DIRECTUS_URL = "https://cms.example.test";
  process.env.DIRECTUS_STATIC_TOKEN = "test-token";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as unknown as Response;
}

describe("directusFetch retry", () => {
  it("retries a transient 502 by default and succeeds on the second attempt", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(502, { error: "bad gateway" }))
      .mockResolvedValueOnce(response(200, { data: { id: "x" } }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { directusFetch } = await import("./directus");
    const res = await directusFetch("/items/thing", { method: "POST", body: "{}" });

    expect(res).toEqual({ data: { id: "x" } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry when retry:false — a non-idempotent POST must never be replayed", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValue(response(502, { error: "bad gateway" }));
    vi.stubGlobal("fetch", fetchMock);

    const { directusFetch } = await import("./directus");
    await expect(
      directusFetch("/items/partner_invoice_lines", {
        method: "POST", body: "{}", retry: false,
      }),
    ).rejects.toThrow("Directus 502");

    // One attempt only: a retried POST could write the line twice.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a timeout when retry:false", async () => {
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
    });
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(timeout);
    vi.stubGlobal("fetch", fetchMock);

    const { directusFetch } = await import("./directus");
    await expect(
      directusFetch("/items/partner_invoices", { method: "POST", body: "{}", retry: false }),
    ).rejects.toThrow("timeout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never forwards the `retry` flag to fetch as a request option", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response(200, { data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const { directusFetch } = await import("./directus");
    await directusFetch("/items/thing", { method: "POST", body: "{}", retry: false });

    const init = fetchMock.mock.calls[0][1] as Record<string, unknown>;
    expect(init).not.toHaveProperty("retry");
    expect(init.method).toBe("POST");
  });
});
