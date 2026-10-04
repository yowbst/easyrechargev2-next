export const CONTACT = "contact";

type Data = Record<string, unknown>;

/**
 * Visible step ids, in order, for the current answers. No welcome screen and
 * no finalize step since v2: the first question is the first screen, and the
 * contact step ends with the submit button.
 */
export function stepSequence(steps: { id: string; skip?: (data: Data) => boolean }[], data: Data): string[] {
  return [...steps.filter((s) => !s.skip?.(data)).map((s) => s.id), CONTACT];
}

/**
 * The step a visitor may land on from a URL: the requested one if every step
 * before it is answered, otherwise the first step that is not. A deep link to
 * `?step=contact` on a fresh tab must not open the contact step empty-handed.
 */
export function clampToFirstIncomplete(
  seq: string[],
  requested: string | null,
  missing: (stepId: string) => string | null,
): string {
  const target = requested ? seq.indexOf(requested) : -1;
  if (target <= 0) return seq[0];
  for (let i = 0; i < target; i++) {
    if (missing(seq[i]) !== null) return seq[i];
  }
  return seq[target];
}

/**
 * The step that must be revisited before the funnel may be submitted: the
 * first step that misses an answer or exits the funnel (tenant). Null when
 * nothing blocks. Browser history can bring a visitor to the contact step past
 * a step whose answers changed, so submit checks the whole sequence.
 */
export function firstBlockingStep(
  seq: string[],
  missing: (stepId: string) => string | null,
  exits: (stepId: string) => boolean,
): string | null {
  return seq.find((id) => exits(id) || missing(id) !== null) ?? null;
}
