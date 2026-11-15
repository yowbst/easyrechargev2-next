/**
 * SEO command center. Same shape as `npm run ingest`: one entry, a command
 * map, per-command flag whitelist so a typo fails instead of being ignored.
 *
 *   npm run seo -- gsc                       # 28 days of Search Console -> data/gsc + Sheet
 *   npm run seo -- geo   [--url <page>]      # AI-readiness audit of the live site
 *   npm run seo -- crawl [--url <page>]      # titles, meta, canonical, h1
 *   npm run seo -- freshness                 # stale blog posts
 *   npm run seo -- keywords <discover|import-ads|cluster|gaps>
 *   npm run seo -- help
 *
 * Needs GOOGLE_SERVICE_ACCOUNT_EMAIL/KEY, SEO_SHEETS_WORKBOOK_ID in .env.local.
 * Runbook: docs/seo.md
 */
import { parseArgs } from "../src/lib/vehicles/ingest/cli-helpers";

const HELP = `Usage: npm run seo -- <command> [flags]

Commands:
  gsc                          Fetch 28 days of Search Console data
  geo [--url <page>] [--dry-run]
                               AI-readiness audit (blog posts + home); --dry-run skips the Sheet
  crawl [--url <start>] [--max-pages <n>] [--dry-run]
                               Titles, meta, h1, canonical, hreflang, alt text across the site
  freshness [--dry-run]        Posts untouched for more than 90 days -> Content Calendar
  keywords <discover "<topic>" | import-ads <csv> [--dry-run] | cluster | gaps>
                               Keyword research into the Keywords Master tab
  sheet <read <tab> | upsert <tab> <keyCol> <json-file> [--protect cols]>
                               Read or write a tab of the SEO workbook (used by skills)
  help                         Show this message

Runbook: docs/seo.md`;

type Command = () => Promise<void>;

const commands: Record<string, () => Promise<Command>> = {
  gsc: async () => (await import("./commands/gsc")).gsc,
  geo: async () => (await import("./commands/geo")).geo,
  crawl: async () => (await import("./commands/crawl")).crawl,
  freshness: async () => (await import("./commands/freshness")).freshness,
  keywords: async () => (await import("./commands/keywords")).keywords,
  sheet: async () => (await import("./commands/sheet")).sheet,
};

/** `takesValue: false` is a bare switch; `true` consumes the next token. */
const COMMAND_FLAGS: Record<string, { name: string; takesValue: boolean }[]> = {
  gsc: [],
  geo: [
    { name: "url", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
  crawl: [
    { name: "url", takesValue: true },
    { name: "max-pages", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
  freshness: [{ name: "dry-run", takesValue: false }],
  keywords: [{ name: "dry-run", takesValue: false }],
  sheet: [{ name: "protect", takesValue: true }],
};

function validateFlags(command: string, argv: string[]): void {
  const allowed = COMMAND_FLAGS[command] ?? [];
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const spec = allowed.find((f) => `--${f.name}` === token);
    if (!spec) throw new Error(`Unknown flag ${token} for "${command}"`);
    if (spec.takesValue) i++;
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { command } = parseArgs(argv);

  if (!command || command === "help" || command === "--help") {
    console.log(HELP);
    return;
  }
  const load = commands[command];
  if (!load) {
    console.error(`Unknown command "${command}"\n\n${HELP}`);
    process.exit(1);
  }
  validateFlags(command, argv);
  await (await load())();
}

main().catch((err) => {
  console.error(`seo failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
