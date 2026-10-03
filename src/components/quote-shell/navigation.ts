export const WELCOME = "welcome";
export const CONTACT = "contact";
export const FINALIZE = "finalize";

type Data = Record<string, unknown>;

/** Visible step ids, in order, for the current answers. */
export function stepSequence(steps: { id: string; skip?: (data: Data) => boolean }[], data: Data): string[] {
  return [WELCOME, ...steps.filter((s) => !s.skip?.(data)).map((s) => s.id), CONTACT, FINALIZE];
}

/**
 * The step a visitor may land on from a URL: the requested one if every step
 * before it is answered, otherwise the first step that is not. A deep link to
 * `?step=finalize` on a fresh tab must not open an empty finalize step.
 */
export function clampToFirstIncomplete(
  seq: string[],
  requested: string | null,
  missing: (stepId: string) => string | null,
): string {
  const target = requested ? seq.indexOf(requested) : -1;
  if (target <= 0) return WELCOME;
  for (let i = 1; i < target; i++) {
    if (missing(seq[i]) !== null) return seq[i];
  }
  return seq[target];
}

/**
 * The step that must be revisited before the funnel may be submitted: the
 * first step after welcome that misses an answer or exits the funnel (tenant).
 * Null when nothing blocks. Browser history can bring a visitor to finalize
 * past a step whose answers changed, so the submit button checks the whole
 * sequence, not only the current step.
 */
export function firstBlockingStep(
  seq: string[],
  missing: (stepId: string) => string | null,
  exits: (stepId: string) => boolean,
): string | null {
  return seq.slice(1).find((id) => exits(id) || missing(id) !== null) ?? null;
}
