/**
 * DataForSEO Gemini LLM scraper (the vendor the SEO citations check already
 * uses). Facts verified against the live API on 2026-11-20:
 *  - the `keyword` field rejects anything over 2,000 characters (task code 40501),
 *    so a classification prompt must fit in that, instructions included;
 *  - the Live endpoint costs $0.004 per call and takes about 30 s;
 *  - the answer arrives in `result[0].markdown`.
 */
export const MAX_KEYWORD_CHARS = 2000;
/** Keeps a margin under the limit for multi-byte characters and the vendor's own counting. */
export const PROMPT_CHAR_BUDGET = 1950;
export const LIVE_PRICE_USD = 0.004;
export const LOCATION_CODE_SWITZERLAND = 2756;
export const CLASSIFY_CONCURRENCY = 4;
export const NAME_MAX_CHARS = 40;
export const PURPOSE_MAX_CHARS = 230;

/**
 * Bump when the prompt or the excerpt logic changes. It is stored at the end of
 * `classification_model`, and results from another version are treated as unknown, so a
 * prompt change relabels everything on the next run instead of mixing two prompts.
 */
export const PROMPT_VERSION = "v2";
