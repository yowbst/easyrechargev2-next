import { LIVE_PRICE_USD, NAME_MAX_CHARS, PROMPT_CHAR_BUDGET, PURPOSE_MAX_CHARS } from "./config";
import { LlmFatalError, type LlmCall, type LlmReply } from "./client";
import { CANDIDATE_PATTERN } from "../ingest/candidates";

/**
 * Shared machinery for the LLM passes over purpose texts (classify, describe): packing
 * companies into prompts under the vendor's keyword limit, a small worker pool, a
 * spending cap, one retry round for the companies a reply skipped, and loud errors.
 */
export interface BatchItem {
  /** purpose_hash: a result is shared by every company with the same purpose text. */
  hash: string;
  name: string;
  purpose: string;
}

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

const line = (n: number, it: BatchItem) =>
  `${n}|${clip(it.name, NAME_MAX_CHARS)}|${clipPurpose(it.purpose)}`;

/** The prompt for one batch; companies are numbered 1..n by position. */
export function buildBatchPrompt(header: string, items: BatchItem[]): string {
  return header + items.map((it, k) => line(k + 1, it)).join("\n");
}

/** Greedy packing under the vendor's keyword limit. */
export function packItems(items: BatchItem[], header: string, budget = PROMPT_CHAR_BUDGET): BatchItem[][] {
  const batches: BatchItem[][] = [];
  let current: BatchItem[] = [];
  let size = header.length;
  for (const it of items) {
    const add = line(current.length + 1, it).length + 1;
    if (current.length > 0 && size + add > budget) {
      batches.push(current);
      current = [];
      size = header.length;
    }
    current.push(it);
    size += line(current.length, it).length + 1;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Pulls the JSON object out of a reply that may be fenced or wrapped in prose. */
export function extractJson(text: string): unknown {
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

export interface BatchStats {
  calls: number;
  spent: number;
  /** Calls whose reply held no valid entry at all. */
  unparseableCalls: number;
  hits: number;
  failed: number;
  /** True when the spending cap stopped the run before every batch was sent. */
  capped: boolean;
  /** Why calls failed, by message, so a mass failure is never silent. */
  errors: Record<string, number>;
}

export async function runBatched<R>(
  items: BatchItem[],
  opts: {
    header: string;
    call: LlmCall;
    maxCost: number;
    concurrency: number;
    /** Already answered (cache or CMS): never sent. */
    isKnown: (hash: string) => boolean;
    parse: (text: string, batchSize: number) => Map<number, R>;
    onHit: (item: BatchItem, result: R, reply: LlmReply) => void;
    onBatch?: (done: number, total: number, spent: number) => void;
  },
): Promise<BatchStats> {
  const stats: BatchStats = { calls: 0, spent: 0, unparseableCalls: 0, hits: 0, failed: 0, capped: false, errors: {} };
  const pending = new Map<string, BatchItem>();
  for (const it of items) if (!opts.isKnown(it.hash)) pending.set(it.hash, it);

  let fatal: Error | null = null;

  const runRound = async (round: BatchItem[]): Promise<BatchItem[]> => {
    const batches = packItems(round, opts.header);
    const unresolved: BatchItem[] = [];
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
        try {
          const reply = await opts.call(buildBatchPrompt(opts.header, batch));
          stats.calls += 1;
          stats.spent += reply.cost;
          const parsed = opts.parse(reply.text, batch.length);
          if (parsed.size === 0) stats.unparseableCalls += 1;
          batch.forEach((it, k) => {
            const hit = parsed.get(k + 1);
            if (hit === undefined) {
              unresolved.push(it);
              return;
            }
            opts.onHit(it, hit, reply);
            stats.hits += 1;
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

    await Promise.all(Array.from({ length: Math.min(opts.concurrency, batches.length) }, worker));
    return unresolved;
  };

  const first = await runRound([...pending.values()]);
  if (fatal) throw fatal;
  const second = stats.capped ? first : await runRound(first);
  if (fatal) throw fatal;
  stats.failed = second.length;
  return stats;
}
