// Bright Data Scraper Studio (Collection API). The /dca/* endpoints are current,
// not deprecated — they were rebranded from "Data Collector".
// Do NOT migrate to /datasets/v3/* — that is for Bright Data's prebuilt scrapers.

const BASE = "https://api.brightdata.com";

/** EVDB | List vehicles — identity + summary specs. */
export const LIST_COLLECTOR =
  process.env.BRIGHTDATA_LIST_COLLECTOR ?? "c_mipqo2it4a63h5g0k";
/** EVDB | Get vehicle — deep spec blocks, one input per car_url. */
export const DETAILS_COLLECTOR =
  process.env.BRIGHTDATA_DETAILS_COLLECTOR ?? "c_misied485yd5jpx0u";

function token(): string {
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (!t) throw new Error("BRIGHTDATA_API_TOKEN is not set");
  return t;
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Stringifies and truncates an unexpected API body for an error message.
 * Bounded so a huge or malformed blob never floods the log, and redacts the
 * live API token if it were ever somehow echoed back in a response body.
 */
function describeUnexpectedBody(body: unknown, max = 300): string {
  let text: string;
  try {
    text = JSON.stringify(body);
  } catch {
    text = String(body);
  }
  const t = process.env.BRIGHTDATA_API_TOKEN;
  if (t) text = text.split(t).join("[REDACTED]");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export async function triggerCollection(
  collectorId: string,
  inputs: unknown[],
): Promise<string> {
  const url = `${BASE}/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(inputs),
  });

  if (!res.ok) {
    const hint =
      res.status === 404
        ? ` — collector "${collectorId}" not found. Check the API key belongs to the account that owns it.`
        : "";
    throw new Error(`Bright Data trigger ${res.status}: ${await res.text()}${hint}`);
  }
  const body = (await res.json()) as { collection_id?: string };
  if (!body.collection_id) throw new Error("Bright Data trigger returned no collection_id");
  return body.collection_id;
}

export async function pollSnapshot(
  snapshotId: string,
  opts: { maxAttempts?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<unknown[]> {
  const maxAttempts = opts.maxAttempts ?? 120;
  const delayMs = opts.delayMs ?? 5_000;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch(`${BASE}/dca/dataset?id=${encodeURIComponent(snapshotId)}`, {
      headers: { Authorization: `Bearer ${token()}` },
    });

    if (!res.ok) throw new Error(`Bright Data dataset ${res.status}: ${await res.text()}`);

    const body = await res.json();

    // Ready: a JSON array. In progress: an object with status "building".
    if (Array.isArray(body)) return body;

    const status = (body as { status?: string } | null)?.status;
    if (status === "building") {
      await sleep(delayMs);
      continue;
    }
    if (status) {
      throw new Error(`Bright Data snapshot ${snapshotId} status: ${status}`);
    }

    // Non-array body with no recognisable status at all — this is not "still
    // building", it's a response shape we've never seen. Treating it as
    // in-progress would poll to exhaustion (120 x 5s by default) and then
    // report a misleading "still building" timeout instead of the real
    // problem. Fail immediately instead.
    throw new Error(
      `Bright Data snapshot ${snapshotId} returned an unrecognised response shape: ` +
        describeUnexpectedBody(body),
    );
  }

  throw new Error(
    `Bright Data snapshot ${snapshotId} still building after ${maxAttempts} attempts`,
  );
}
