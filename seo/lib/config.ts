import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export interface SiteConfig {
  siteUrl: string;
  gscProperty: string;
  languages: string[];
  sheetsTabNames: {
    keywordsMaster: string;
    contentCalendar: string;
    topicClusters: string;
    performance: string;
    siteHealth: string;
    scoreHistory: string;
    issues: string;
    aiCitations: string;
  };
  framework: string;
  psi: Record<string, unknown>;
  spin: Record<string, unknown>;
  geo: {
    aiBots: string[];
    freshnessThresholdDays: number;
    targetCitationsPerWords: number;
    questionHeadingTargetPct: number;
  };
}

export const site: SiteConfig = JSON.parse(
  readFileSync(resolve(SEO_ROOT, "site.json"), "utf-8"),
);

/** Everything written by the commands goes under seo/data/ (gitignored). */
export const dataDir = resolve(SEO_ROOT, "data");

/** Read an env var a command needs; fail with the name instead of a vague 401 later. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (add it to .env.local)`);
  return value;
}

/** Sheets workbook that holds the SEO tabs. */
export const workbookId = () => requireEnv("SEO_SHEETS_WORKBOOK_ID");

/** Search Console property, e.g. `sc-domain:easyrecharge.ch`. */
export const gscProperty = () => process.env.GSC_PROPERTY || site.gscProperty;
