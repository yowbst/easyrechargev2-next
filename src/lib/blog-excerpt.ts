/**
 * Derive a card excerpt for a blog post.
 *
 * `blog_posts_translations` has no `excerpt` field — the codebase reads
 * `pt.excerpt` in several places and has always got `undefined` back, which is
 * why post cards render with no description anywhere on the site. Rather than
 * add a field and backfill 31 posts in two languages, this derives one from
 * content that is already there:
 *
 *   1. the SEO meta description, when an editor wrote one (~45% of FR posts) —
 *      it is a human-written one-sentence summary, which is exactly the job;
 *   2. otherwise the opening of the body.
 *
 * Bodies tend to repeat the title as their first line, so that repetition is
 * dropped before the text is cut — otherwise every card would read as its own
 * headline twice.
 */
export function deriveExcerpt(
  translation: { body?: string | null; seo?: { meta_description?: string | null } | null } | null | undefined,
  title: string,
  maxLength = 160,
): string {
  if (!translation) return "";

  const meta = translation.seo?.meta_description?.trim();
  if (meta) return truncateAtBoundary(meta, maxLength);

  const plain = stripHtml(translation.body ?? "");
  return truncateAtBoundary(dropLeadingTitle(plain, title), maxLength);
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** Remove a leading repetition of the title, with or without its punctuation. */
function dropLeadingTitle(text: string, title: string): string {
  const normalise = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const t = normalise(title);
  if (!t) return text;
  if (normalise(text).startsWith(t)) {
    // Walk the raw string until the same number of significant characters
    // has been consumed, so accents and punctuation are not miscounted.
    let seen = 0;
    const target = t.replace(/ /g, "").length;
    for (let i = 0; i < text.length; i++) {
      if (/[\p{L}\p{N}]/u.test(text[i])) seen++;
      if (seen === target) return text.slice(i + 1).replace(/^[\s?!.:—–-]+/, "");
    }
  }
  return text;
}

/** Cut on a sentence end when one is close enough, otherwise on a word. */
function truncateAtBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const window = text.slice(0, maxLength);
  const sentence = Math.max(
    window.lastIndexOf(". "),
    window.lastIndexOf(" ! "),
    window.lastIndexOf(" ? "),
  );
  if (sentence > maxLength * 0.6) return window.slice(0, sentence + 1).trim();
  const word = window.lastIndexOf(" ");
  return `${(word > 0 ? window.slice(0, word) : window).trim()}…`;
}
