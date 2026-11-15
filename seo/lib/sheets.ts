import { google } from "googleapis";
import { workbookId } from "./config";
import { googleAuth } from "./google";
import { withRetry } from "./retry";

export type Row = Record<string, string | number>;

let api: ReturnType<typeof google.sheets> | null = null;
function sheets() {
  api ??= google.sheets({
    version: "v4",
    auth: googleAuth(["https://www.googleapis.com/auth/spreadsheets"]),
  });
  return api;
}

const rangeOf = (tab: string, cells = "") => `'${tab}'${cells ? `!${cells}` : ""}`;

async function readRaw(tab: string, cells = ""): Promise<string[][]> {
  const res = await withRetry(() =>
    sheets().spreadsheets.values.get({ spreadsheetId: workbookId(), range: rangeOf(tab, cells) }),
  );
  return (res.data.values as string[][] | undefined) ?? [];
}

const toObject = (headers: string[], row: string[]): Record<string, string> =>
  Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ""]));

const compositeKey = (obj: Record<string, unknown>, keys: string[]) =>
  keys.map((k) => String(obj[k] ?? "")).join("|||");

/** Creates the tab with a header row when it does not exist yet. */
export async function ensureTab(tab: string, headers: string[] = []): Promise<void> {
  const meta = await sheets().spreadsheets.get({ spreadsheetId: workbookId() });
  if (meta.data.sheets?.some((s) => s.properties?.title === tab)) return;

  await sheets().spreadsheets.batchUpdate({
    spreadsheetId: workbookId(),
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
  if (headers.length) {
    await sheets().spreadsheets.values.update({
      spreadsheetId: workbookId(),
      range: rangeOf(tab, "A1"),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [headers] },
    });
  }
}

/** Every row of a tab as an object keyed by the header row. */
export async function readTab(tab: string): Promise<Record<string, string>[]> {
  const [headers, ...rows] = await readRaw(tab);
  return headers ? rows.map((r) => toObject(headers, r)) : [];
}

/**
 * Upserts by key column(s). New data wins over an existing row except for
 * `protectedColumns`, which keep their value (hand-edited cells such as intent).
 */
export async function upsertRows(
  tab: string,
  rows: Row[],
  keyColumns: string | string[],
  protectedColumns: string[] = [],
): Promise<{ updated: number; appended: number }> {
  const keys = Array.isArray(keyColumns) ? keyColumns : [keyColumns];
  const [headers, ...body] = await readRaw(tab);
  if (!headers) throw new Error(`Tab "${tab}" has no header row`);

  // Sheets rows are 1-indexed and row 1 is the header.
  const existing = new Map(
    body.map((r, i) => {
      const obj = toObject(headers, r);
      return [compositeKey(obj, keys), { obj, rowIndex: i + 2 }] as const;
    }),
  );

  const updates: { range: string; values: string[][] }[] = [];
  const appends: string[][] = [];

  for (const row of rows) {
    const found = existing.get(compositeKey(row, keys));
    if (found) {
      const merged: Record<string, unknown> = { ...found.obj };
      for (const [k, v] of Object.entries(row)) if (!protectedColumns.includes(k)) merged[k] = v;
      updates.push({
        range: rangeOf(tab, `A${found.rowIndex}`),
        values: [headers.map((h) => String(merged[h] ?? ""))],
      });
    } else {
      appends.push(headers.map((h) => String(row[h] ?? "")));
    }
  }

  if (updates.length) {
    await withRetry(() =>
      sheets().spreadsheets.values.batchUpdate({
        spreadsheetId: workbookId(),
        requestBody: { valueInputOption: "USER_ENTERED", data: updates },
      }),
    );
  }
  if (appends.length) {
    await withRetry(() =>
      sheets().spreadsheets.values.append({
        spreadsheetId: workbookId(),
        range: rangeOf(tab, "A1"),
        valueInputOption: "USER_ENTERED",
        requestBody: { values: appends },
      }),
    );
  }
  return { updated: updates.length, appended: appends.length };
}

/**
 * Marks `open` rows as "resolved (auto)" when they match `filter` but their key
 * is no longer in `keepKeys`: issues an audit stopped detecting.
 */
export async function markResolvedAuto(
  tab: string,
  keyColumns: string | string[],
  keepKeys: (string | string[])[],
  filter?: (row: Record<string, string>) => boolean,
): Promise<{ resolved: number }> {
  const keys = Array.isArray(keyColumns) ? keyColumns : [keyColumns];
  const keep = new Set(keepKeys.map((k) => (Array.isArray(k) ? k.join("|||") : k)));
  const raw = await readRaw(tab);
  const headers = raw[0];
  const statusIdx = headers?.indexOf("status") ?? -1;
  if (!headers || statusIdx === -1) return { resolved: 0 };

  const updates: { range: string; values: string[][] }[] = [];
  for (let i = 1; i < raw.length; i++) {
    const obj = toObject(headers, raw[i]);
    if (obj.status === "open" && (!filter || filter(obj)) && !keep.has(compositeKey(obj, keys))) {
      const next = [...raw[i]];
      next[statusIdx] = "resolved (auto)";
      updates.push({ range: rangeOf(tab, `A${i + 1}`), values: [next] });
    }
  }

  if (updates.length) {
    await withRetry(() =>
      sheets().spreadsheets.values.batchUpdate({
        spreadsheetId: workbookId(),
        requestBody: { valueInputOption: "USER_ENTERED", data: updates },
      }),
    );
  }
  return { resolved: updates.length };
}

/** Appends rows without upserting (history tabs such as Performance). */
export async function appendRows(tab: string, rows: Row[]): Promise<{ appended: number }> {
  const headers = (await readRaw(tab, "1:1"))[0];
  if (!headers) throw new Error(`Tab "${tab}" has no header row`);

  const values = rows.map((row) => headers.map((h) => String(row[h] ?? "")));
  await withRetry(() =>
    sheets().spreadsheets.values.append({
      spreadsheetId: workbookId(),
      range: rangeOf(tab, "A1"),
      valueInputOption: "USER_ENTERED",
      requestBody: { values },
    }),
  );
  return { appended: values.length };
}
