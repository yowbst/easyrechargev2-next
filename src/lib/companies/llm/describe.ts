import { z } from "zod";
import { CLASSIFY_CONCURRENCY, DESCRIBE_VERSION } from "./config";
import type { LlmCall } from "./client";
import { extractJson, runBatched, type BatchItem, type BatchStats } from "./batch";
import type { DescriptionResult } from "../ingest/types";

import { SPECIALTIES, type SpecialtyKey } from "../specialties";
export { SPECIALTIES, type SpecialtyKey };
const KEYS = Object.keys(SPECIALTIES) as SpecialtyKey[];

const HEADER =
  "Pour chaque entreprise suisse d'électricité, d'après son but social. " +
  "s = spécialités explicitement citées, 4 au plus, parmi: courant_fort, courant_faible, telecom, photovoltaique, " +
  "domotique, securite, bornes (recharge de véhicules), controles (OIBT), depannage, eclairage, chauffage. " +
  "t = ce que fait l'entreprise, une phrase de 70 caractères au plus, en français, sans nom, lieu, chiffre ni superlatif. " +
  'Réponds UNIQUEMENT par du JSON brut: {"r":[{"i":1,"s":["courant_fort"],"t":"Installations électriques et télécom"}]}\n' +
  "Entreprises (i|nom|but):\n";

export interface ParsedDescription {
  specialties: SpecialtyKey[];
  summary: string;
}

const itemSchema = z.object({
  i: z.coerce.number().int(),
  s: z.array(z.string()).optional(),
  t: z.string(),
});

/** Keeps only known specialty keys (max 4, display order) and a clean one-line summary. */
export function parseDescribeResponse(text: string, batchSize: number): Map<number, ParsedDescription> {
  const out = new Map<number, ParsedDescription>();
  const json = extractJson(text) as { r?: unknown } | null;
  if (!json || !Array.isArray(json.r)) return out;
  for (const raw of json.r) {
    const p = itemSchema.safeParse(raw);
    if (!p.success) continue;
    const { i, s, t } = p.data;
    if (i < 1 || i > batchSize || out.has(i)) continue;
    const given = new Set((s ?? []).map((k) => k.trim().toLowerCase()));
    const specialties = KEYS.filter((k) => given.has(k)).slice(0, 4);
    const summary = t.replace(/\s+/g, " ").trim().replace(/[.;,]+$/, "");
    if (summary.length < 4) continue;
    out.set(i, { specialties, summary: summary.length > 80 ? summary.slice(0, 79).replace(/\s+\S*$/, "") + "…" : summary });
  }
  return out;
}

export interface DescribeCache {
  get(hash: string): DescriptionResult | undefined;
  set(hash: string, result: DescriptionResult): void;
}

export async function describePurposes(
  items: BatchItem[],
  opts: {
    call: LlmCall;
    cache: DescribeCache;
    maxCost: number;
    concurrency?: number;
    now?: () => string;
    onBatch?: (done: number, total: number, spent: number) => void;
  },
): Promise<BatchStats> {
  const now = opts.now ?? (() => new Date().toISOString());
  return runBatched<ParsedDescription>(items, {
    header: HEADER,
    call: opts.call,
    maxCost: opts.maxCost,
    concurrency: opts.concurrency ?? CLASSIFY_CONCURRENCY,
    isKnown: (h) => !!opts.cache.get(h),
    parse: parseDescribeResponse,
    onHit: (it, d, reply) =>
      opts.cache.set(it.hash, {
        specialties: d.specialties,
        trade_summary: d.summary,
        described_model: `dataforseo-gemini:${reply.model ?? "unknown"}:${DESCRIBE_VERSION}`,
        described_at: now(),
        described_purpose_hash: it.hash,
      }),
    onBatch: opts.onBatch,
  });
}

export const DESCRIBE_HEADER = HEADER;
