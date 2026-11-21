import { z } from "zod";
import {
  CLASSIFY_CONCURRENCY,
  LIVE_PRICE_USD,
  NAME_MAX_CHARS,
  PROMPT_CHAR_BUDGET,
  PROMPT_VERSION,
  PURPOSE_MAX_CHARS,
} from "./config";
import { LlmFatalError, type LlmCall } from "./client";
import { CANDIDATE_PATTERN } from "../ingest/candidates";
import {
  CLASSIFICATION_LABELS,
  type ClassificationLabel,
  type ClassificationResult,
} from "../ingest/types";

export interface ClassifyItem {
  /** purpose_hash: results are shared by every company with the same purpose text. */
  hash: string;
  name: string;
  purpose: string;
}

const HEADER =
  "Classe chaque entreprise suisse selon son but social. Labels: " +
  "installer=réalise des installations ou travaux électriques, même si l'électricité n'est qu'un des métiers cités; " +
  "inspector=contrôle/expertise OIBT sans installer; planner=bureau d'études/conseil sans exécution; " +
  "solar=photovoltaïque seul; other=le reste (commerce, informatique, fabrication, holding). " +
  'Réponds UNIQUEMENT par du JSON brut: {"r":[{"i":1,"l":"label","c":0.0-1.0,"w":"raison 10 mots max"}]}\n' +
  "Entreprises (i|nom|but):\n";

const clip = (s: string, max: number) => {
  const flat = s.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)) + "…";
};

const EVIDENCE_RE = new RegExp(CANDIDATE_PATTERN, "i");
const HEAD_CHARS = 100;

/**
 * The excerpt of a purpose the model sees. Three quarters of purposes are longer than the
 * prompt budget allows, and the installer wording often comes late ("... Handel mit
 * Waren, Montage von Elektroanlagen"), so a plain cut at the start hides the one thing
 * that matters. When the first installer wording would fall outside the cut, keep the
 * opening (what the company says it is) plus the passage around that wording.
 */
export function clipPurpose(purpose: string, max = PURPOSE_MAX_CHARS): string {
  const flat = purpose.replace(/\s+/g, " ").replace(/\|/g, "/").trim();
  if (flat.length <= max) return flat;
  const m = EVIDENCE_RE.exec(flat);
  if (!m || m.index + m[0].length <= max - 10) return clip(flat, max);
  const head = flat.slice(0, HEAD_CHARS);
  const budget = max - HEAD_CHARS - 4;
  const start = Math.max(HEAD_CHARS, m.index - 40);
  let tail = flat.slice(start, start + budget);
  if (start > HEAD_CHARS) tail = tail.slice(Math.max(tail.indexOf(" "), 0)).trimStart();
  if (start + budget < flat.length) tail = tail.slice(0, Math.max(tail.lastIndexOf(" "), budget - 15));
  return `${head.slice(0, head.lastIndexOf(" ") > 60 ? head.lastIndexOf(" ") : head.length)}… ${tail}…`;
}

const line = (n: number, it: ClassifyItem) =>
  `${n}|${clip(it.name, NAME_MAX_CHARS)}|${clipPurpose(it.purpose)}`;

/** The prompt for one batch; companies are numbered 1..n by position. */
export function buildClassifyPrompt(items: ClassifyItem[]): string {
  return HEADER + items.map((it, k) => line(k + 1, it)).join("\n");
}

/** Greedy packing under the vendor's keyword limit. */
export function packBatches(items: ClassifyItem[], budget = PROMPT_CHAR_BUDGET): ClassifyItem[][] {
  const batches: ClassifyItem[][] = [];
  let current: ClassifyItem[] = [];
  let size = HEADER.length;
  for (const it of items) {
    const add = line(current.length + 1, it).length + 1;
    if (current.length > 0 && size + add > budget) {
      batches.push(current);
      current = [];
      size = HEADER.length;
    }
    current.push(it);
    size += line(current.length, it).length + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
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

/** Pulls the JSON object out of a reply that may be fenced or wrapped in prose. */
function extractJson(text: string): unknown {
  const unfenced = text.replace(/```(?:json)?/gi, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(unfenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

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
  const stats: ClassifyStats = { calls: 0, spent: 0, unparseableCalls: 0, classified: 0, failed: 0, capped: false, errors: {} };
  const concurrency = opts.concurrency ?? CLASSIFY_CONCURRENCY;

  const pending = new Map<string, ClassifyItem>();
  for (const it of items) if (!opts.cache.get(it.hash)) pending.set(it.hash, it);

  let fatal: Error | null = null;

  const runRound = async (round: ClassifyItem[]): Promise<ClassifyItem[]> => {
    const batches = packBatches(round);
    const unresolved: ClassifyItem[] = [];
    let next = 0;
    let finished = 0;

    const worker = async () => {
      while (!fatal) {
        const index = next++;
        if (index >= batches.length) return;
        const batch = batches[index];
        if (stats.spent + LIVE_PRICE_USD > opts.maxCost) {
          stats.capped = true;
          unresolved.push(...batch);
          continue;
        }
        let parsed = new Map<number, ParsedLabel>();
        try {
          const reply = await opts.call(buildClassifyPrompt(batch));
          stats.calls += 1;
          stats.spent += reply.cost;
          parsed = parseClassifyResponse(reply.text, batch.length);
          if (parsed.size === 0) stats.unparseableCalls += 1;
          batch.forEach((it, k) => {
            const hit = parsed.get(k + 1);
            if (!hit) {
              unresolved.push(it);
              return;
            }
            opts.cache.set(it.hash, {
              classification: hit.label,
              classification_confidence: hit.confidence,
              classification_reason: hit.reason || null,
              classification_model: `dataforseo-gemini:${reply.model ?? "unknown"}:${PROMPT_VERSION}`,
              classified_at: now(),
              classified_purpose_hash: it.hash,
            });
            stats.classified += 1;
          });
        } catch (e) {
          if (e instanceof LlmFatalError) {
            fatal = e;
            unresolved.push(...batch);
            return;
          }
          stats.calls += 1; // the vendor may still have charged for a failed task
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 160);
          stats.errors[msg] = (stats.errors[msg] ?? 0) + 1;
          unresolved.push(...batch);
        }
        finished += 1;
        opts.onBatch?.(finished, batches.length, stats.spent);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, batches.length) }, worker));
    return unresolved;
  };

  const first = await runRound([...pending.values()]);
  if (fatal) throw fatal;
  const second = stats.capped ? first : await runRound(first);
  if (fatal) throw fatal;
  stats.failed = second.length;
  return stats;
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
