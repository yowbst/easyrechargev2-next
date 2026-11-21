import type { FlagSpec } from "@/lib/vehicles/ingest/cli-helpers";

/** Flag whitelist per `npm run companies` command; typos fail loudly (see validateFlags). */
export const COMPANY_COMMAND_FLAGS: Record<string, FlagSpec[]> = {
  "geo-dataset": [{ name: "csv", takesValue: true }],
  fetch: [
    { name: "canton", takesValue: true },
    { name: "limit", takesValue: true },
  ],
  normalize: [{ name: "in", takesValue: true }],
  classify: [
    { name: "in", takesValue: true },
    { name: "limit", takesValue: true },
    { name: "max-cost", takesValue: true },
    { name: "canton", takesValue: true },
    { name: "force", takesValue: false },
    { name: "no-cms", takesValue: false },
    { name: "eval", takesValue: false },
    { name: "dry-run", takesValue: false },
  ],
  plan: [
    { name: "in", takesValue: true },
    { name: "canton", takesValue: true },
    { name: "max-change-ratio", takesValue: true },
    { name: "partial", takesValue: false },
  ],
  apply: [
    { name: "plan", takesValue: true },
    { name: "dry-run", takesValue: false },
  ],
  report: [{ name: "canton", takesValue: true }],
  export: [
    { name: "canton", takesValue: true },
    { name: "classification", takesValue: true },
    { name: "prospect-status", takesValue: true },
  ],
};
