import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { site } from "../lib/config";
import { readTab, upsertRows, type Row } from "../lib/sheets";

const tabKeys = Object.keys(site.sheetsTabNames) as (keyof typeof site.sheetsTabNames)[];

function tabName(key: string | undefined): string {
  const name = site.sheetsTabNames[key as keyof typeof site.sheetsTabNames];
  if (!name) throw new Error(`Unknown tab "${key}". Use one of: ${tabKeys.join(", ")}`);
  return name;
}

/**
 * Generic access to the SEO workbook, for skills that read or write a tab.
 *   sheet read <tab>                                  # rows as JSON on stdout
 *   sheet upsert <tab> <keyCol[,keyCol]> <json-file> [--protect colA,colB]
 * `<tab>` is a key of seo/site.json `sheetsTabNames` (keywordsMaster, issues, ...).
 */
export async function sheet(): Promise<void> {
  const argv = process.argv.slice(2);
  const [, action, tab, keyCols, file] = argv;
  const protectIdx = argv.indexOf("--protect");
  const protectedColumns = protectIdx >= 0 ? argv[protectIdx + 1].split(",") : [];

  if (action === "read") {
    console.log(JSON.stringify(await readTab(tabName(tab)), null, 2));
    return;
  }
  if (action === "upsert") {
    if (!keyCols || !file) throw new Error("Usage: sheet upsert <tab> <keyCol[,keyCol]> <json-file> [--protect cols]");
    const rows = JSON.parse(readFileSync(resolve(file), "utf-8")) as Row[];
    if (!Array.isArray(rows)) throw new Error(`${file} must contain a JSON array of rows`);
    const res = await upsertRows(tabName(tab), rows, keyCols.split(","), protectedColumns);
    console.log(`Updated: ${res.updated} | new: ${res.appended}`);
    return;
  }
  throw new Error(`Usage: npm run seo -- sheet <read <tab> | upsert <tab> <keyCol> <json-file> [--protect cols]>`);
}
