import { z } from "zod";
import { CLASSIFY_CONCURRENCY, PROMPT_CHAR_BUDGET, PROMPT_VERSION } from "./config";
import type { LlmCall } from "./client";
import { buildBatchPrompt, extractJson, packItems, runBatched, type BatchItem } from "./batch";
import {
  CLASSIFICATION_LABELS,
  type ClassificationLabel,
  type ClassificationResult,
} from "../ingest/types";

export type ClassifyItem = BatchItem;

const HEADER =
  "Classe chaque entreprise suisse selon son but social. Labels: " +
  "installer=réalise des installations ou travaux électriques, même si l'électricité n'est qu'un des métiers cités; " +
  "inspector=contrôle/expertise OIBT sans installer; planner=bureau d'études/conseil sans exécution; " +
  "solar=photovoltaïque seul; other=le reste (commerce, informatique, fabrication, holding). " +
  'Réponds UNIQUEMENT par du JSON brut: {"r":[{"i":1,"l":"label","c":0.0-1.0,"w":"raison 10 mots max"}]}\n' +
  "Entreprises (i|nom|but):\n";

export { clipPurpose } from "./batch";

/** The prompt for one batch; companies are numbered 1..n by position. */
export function buildClassifyPrompt(items: ClassifyItem[]): string {
  return buildBatchPrompt(HEADER, items);
}

/** Greedy packing under the vendor's keyword limit. */
export function packBatches(items: ClassifyItem[], budget = PROMPT_CHAR_BUDGET): ClassifyItem[][] {
  return packItems(items, HEADER, budget);
}

export interface ParsedLabel {
  label: ClassificationLabel;
  confidence: number;
  reason: string;
}

const itemSchema = z.object({
  i: z.coerce.number().int(),
  l: z.string(),
  c: z.coerce.number(),
  w: z.string().optional(),
});

/**
 * Valid entries only, keyed by 1-based batch position. Anything malformed,
 * out of range or carrying an unknown label is simply absent, so the caller
 * retries exactly the companies that did not come back.
 */
export function parseClassifyResponse(text: string, batchSize: number): Map<number, ParsedLabel> {
  const out = new Map<number, ParsedLabel>();
  const json = extractJson(text) as { r?: unknown } | null;
  if (!json || !Array.isArray(json.r)) return out;
  for (const raw of json.r) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { i, l, c, w } = parsed.data;
    const label = l.trim().toLowerCase() as ClassificationLabel;
    if (i < 1 || i > batchSize || out.has(i)) continue;
    if (!(CLASSIFICATION_LABELS as readonly string[]).includes(label)) continue;
    if (!Number.isFinite(c)) continue;
    out.set(i, {
      label,
      confidence: Number(Math.min(1, Math.max(0, c)).toFixed(2)),
      reason: (w ?? "").replace(/\s+/g, " ").trim().slice(0, 255),
    });
  }
  return out;
}

export interface ClassifyCache {
  get(hash: string): ClassificationResult | undefined;
  set(hash: string, result: ClassificationResult): void;
}

export interface ClassifyStats {
  calls: number;
  spent: number;
  /** Calls whose reply held no valid entry at all (not JSON, or every entry invalid). */
  unparseableCalls: number;
  classified: number;
  failed: number;
  /** True when the spending cap stopped the run before every batch was sent. */
  capped: boolean;
  /** Why calls failed, by message, so a mass failure is never silent. */
  errors: Record<string, number>;
}

/**
 * Classifies each distinct purpose once. Misses are packed into batches, sent
 * with a small worker pool, and the items a reply skipped are retried once in
 * fresh batches. Results are cached as they land, so an interrupted run
 * resumes where it stopped.
 */
export async function classifyPurposes(
  items: ClassifyItem[],
  opts: {
    call: LlmCall;
    cache: ClassifyCache;
    maxCost: number;
    concurrency?: number;
    now?: () => string;
    onBatch?: (done: number, total: number, spent: number) => void;
  },
): Promise<ClassifyStats> {
  const now = opts.now ?? (() => new Date().toISOString());
  const s = await runBatched<ParsedLabel>(items, {
    header: HEADER,
    call: opts.call,
    maxCost: opts.maxCost,
    concurrency: opts.concurrency ?? CLASSIFY_CONCURRENCY,
    isKnown: (h) => !!opts.cache.get(h),
    parse: parseClassifyResponse,
    onHit: (it, hit, reply) =>
      opts.cache.set(it.hash, {
        classification: hit.label,
        classification_confidence: hit.confidence,
        classification_reason: hit.reason || null,
        classification_model: `dataforseo-gemini:${reply.model ?? "unknown"}:${PROMPT_VERSION}`,
        classified_at: now(),
        classified_purpose_hash: it.hash,
      }),
    onBatch: opts.onBatch,
  });
  return { calls: s.calls, spent: s.spent, unparseableCalls: s.unparseableCalls, classified: s.hits, failed: s.failed, capped: s.capped, errors: s.errors };
}

export interface GoldenItem {
  id: string;
  name: string;
  purpose: string;
  expected: ClassificationLabel;
}

export interface EvalReport {
  total: number;
  correct: number;
  accuracy: number;
  /** confusion[expected][got] */
  confusion: Record<string, Record<string, number>>;
  missing: number;
  mistakes: { id: string; name: string; expected: string; got: string }[];
}

export function evaluate(golden: GoldenItem[], got: Map<string, ClassificationLabel | undefined>): EvalReport {
  const confusion: Record<string, Record<string, number>> = {};
  const mistakes: EvalReport["mistakes"] = [];
  let correct = 0;
  let missing = 0;
  for (const g of golden) {
    const label = got.get(g.id);
    const key = label ?? "unclassified";
    confusion[g.expected] ??= {};
    confusion[g.expected][key] = (confusion[g.expected][key] ?? 0) + 1;
    if (!label) missing += 1;
    if (label === g.expected) correct += 1;
    else mistakes.push({ id: g.id, name: g.name, expected: g.expected, got: key });
  }
  return { total: golden.length, correct, accuracy: golden.length ? correct / golden.length : 0, confusion, missing, mistakes };
}
