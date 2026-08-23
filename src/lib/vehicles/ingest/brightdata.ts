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

/**
 * Statuses the API reports while a job is still in flight. Observed live:
 * "collecting" (job running) and "building" (dataset being assembled).
 * The others are documented job states included defensively.
 *
 * Anything NOT in this set is treated as terminal and throws immediately.
 * That direction is deliberate: an unknown terminal state that we polled
 * through would waste the full attempt budget and then report a misleading
 * "still building" timeout instead of the real failure.
 */
const IN_PROGRESS_STATUSES = new Set([
  "collecting",
  "building",
  "starting",
  "running",
  "pending",
  "queued",
]);

/** Keys that mark a body as a DATA row rather than a status envelope. */
const DATA_ROW_KEYS = ["car_url", "evdb_id", "vehicle", "input"];

type SnapshotBody =
  | { kind: "rows"; rows: unknown[] }
  | { kind: "status"; status: string; message?: string }
  | { kind: "unrecognised" };

/**
 * A ready snapshot is newline-delimited JSON — one object per line — NOT a
 * JSON array, so `res.json()` throws on the second line. A single-row
 * snapshot is one bare JSON object, which is why a lone object has to be
 * distinguished from a status envelope by its keys rather than by shape.
 */
export function parseSnapshotBody(text: string): SnapshotBody {
  if (!text) return { kind: "unrecognised" };

  // Whole-body parse first: covers a JSON array and a single-object row.
  try {
    const single = JSON.parse(text);

    if (Array.isArray(single)) return { kind: "rows", rows: single };

    if (single && typeof single === "object") {
      const obj = single as Record<string, unknown>;
      const isDataRow = DATA_ROW_KEYS.some((k) => k in obj);

      // An empty status string carries no information — fall through to
      // "unrecognised" rather than reporting a blank terminal status.
      if (typeof obj.status === "string" && obj.status !== "" && !isDataRow) {
        return {
          kind: "status",
          status: obj.status,
          message: typeof obj.message === "string" ? obj.message : undefined,
        };
      }

      // A lone object counts as a single-row snapshot only if it actually
      // looks like one. An object with neither a status nor any data key is
      // something we do not understand — say so rather than passing it
      // downstream dressed as a vehicle.
      if (isDataRow) return { kind: "rows", rows: [obj] };

      return { kind: "unrecognised" };
    }

    return { kind: "unrecognised" };
  } catch {
    // Not a single JSON document — expect NDJSON.
  }

  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      rows.push(JSON.parse(trimmed));
    } catch {
      return { kind: "unrecognised" };
    }
  }

  return rows.length ? { kind: "rows", rows } : { kind: "unrecognised" };
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

    const text = (await res.text()).trim();
    const parsed = parseSnapshotBody(text);

    if (parsed.kind === "rows") return parsed.rows;

    if (parsed.kind === "status") {
      if (IN_PROGRESS_STATUSES.has(parsed.status)) {
        await sleep(delayMs);
        continue;
      }
      throw new Error(
        `Bright Data snapshot ${snapshotId} status: ${parsed.status}` +
          (parsed.message ? ` — ${parsed.message}` : ""),
      );
    }

    const body = text;

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
