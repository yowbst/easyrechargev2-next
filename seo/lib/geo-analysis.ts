import * as cheerio from "cheerio";
import { authorsOf, extractJsonLd, findNode, hasType, typesOf } from "./jsonld";

export interface GeoConfig {
  freshnessThresholdDays: number;
  targetCitationsPerWords: number;
  questionHeadingTargetPct: number;
}

export interface Issue {
  url: string;
  issue_type: string;
  severity: "critical" | "warning" | "info";
  details: string;
  date_found: string;
  status: "open";
}

export interface Scorecard {
  url: string;
  page_title: string;
  geo_score: number;
  bots_accessible: string;
  schema_types: string;
  paragraph_quality_pct: string;
  question_headings_pct: string;
  direct_answers_pct: string;
  content_age_days: string;
  has_author: "yes" | "no";
  has_faq: "yes" | "no";
  citation_density: string;
  last_audited: string;
}

const TARGET_SCHEMAS = ["Article", "BlogPosting", "FAQPage", "HowTo", "Organization", "Person"];
const QUESTION_START = /^(comment|pourquoi|quel|quelle|quels|quelles|combien|est-ce|faut-il|peut-on|où|quand|qui)/i;
const STAT = /(\d+[.,]?\d*\s*(%|CHF|kWh|km|francs|pour cent))|(\d+\s*(sur|de)\s*\d+)/gi;
const SOURCE = /(selon|source\s*:|d'après|étude|rapport|enquête|statistiques?)\s/gi;

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Scores one page for AI-search readiness (0-85 here; the 15 bot-access points
 * are added at site level by the command). Pure: no I/O, `now` is injected.
 */
export function analyzePageGeo(
  url: string,
  html: string,
  cfg: GeoConfig,
  now: Date = new Date(),
): { issues: Issue[]; scorecard: Scorecard; rawScore: number } {
  const $ = cheerio.load(html);
  const dateFound = now.toISOString().slice(0, 10);

  // 1. Structured data, read from every node of every JSON-LD block.
  const nodes = extractJsonLd($);
  const schemaTypes = nodes.flatMap(typesOf);
  const foundSchemas = TARGET_SCHEMAS.filter((t) => schemaTypes.includes(t));

  // 2. Paragraphs of 2-3 sentences.
  let totalParagraphs = 0;
  let optimalParagraphs = 0;
  for (const p of $("article p, main p, .content p, body p").toArray()) {
    const text = $(p).text().trim();
    if (text.length < 20) continue;
    totalParagraphs++;
    const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 5);
    if (sentences.length >= 2 && sentences.length <= 3) optimalParagraphs++;
  }
  const paragraphQualityPct = pct(optimalParagraphs, totalParagraphs);

  // 3-4. Question H2s, and a 40-60 word direct answer right after.
  const h2s = $("h2").toArray();
  let questionH2s = 0;
  let directAnswerH2s = 0;
  for (const h2 of h2s) {
    const text = $(h2).text().trim();
    if (QUESTION_START.test(text) || text.endsWith("?")) questionH2s++;
    const nextP = $(h2).next("p");
    if (nextP.length) {
      const words = nextP.text().trim().split(/\s+/).length;
      if (words >= 40 && words <= 60) directAnswerH2s++;
    }
  }
  const questionHeadingPct = pct(questionH2s, h2s.length);
  const directAnswerPct = pct(directAnswerH2s, h2s.length);

  // 5. Freshness.
  const article = findNode(nodes, "Article", "BlogPosting");
  const datePublished =
    (article?.datePublished as string | undefined) ||
    $('meta[property="article:published_time"]').attr("content") ||
    "";
  const dateModified =
    (article?.dateModified as string | undefined) ||
    $('meta[property="article:modified_time"]').attr("content") ||
    "";
  const latest = dateModified || datePublished;
  let contentAgeDays = -1;
  if (latest) {
    const d = new Date(latest);
    if (!Number.isNaN(d.getTime())) contentAgeDays = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  }

  // 6. Author: inline, array or @id reference; Person counts more than Organization.
  const authors = authorsOf(article, nodes);
  const hasAuthor =
    authors.some((a) => typeof a.name === "string" && a.name !== "") ||
    !!$('meta[name="author"]').attr("content") ||
    $('[rel="author"]').length > 0;
  const authorType = authors.some((a) => hasType(a, "Person")) ? "Person" : (typesOf(authors[0] ?? {})[0] ?? "");

  // 7. FAQ.
  const faqNode = findNode(nodes, "FAQPage");
  const hasFaqSchema = !!faqNode;
  const hasFaqHtml =
    $("h2, h3").filter((_, el) => /faq|questions?\s+(fr[ée]quentes|courantes)/i.test($(el).text())).length > 0;
  const hasFaq = hasFaqSchema || hasFaqHtml;

  // 8. Static HTML must carry the text: AI bots do not run JS.
  const bodyTextLength = $("body").text().replace(/\s+/g, " ").trim().length;

  // 9. Citation density: one statistic or source mention per N words.
  const bodyText = $("article, main, .content").text() || $("body").text();
  const wordCount = bodyText.split(/\s+/).length;
  const citations = (bodyText.match(STAT) ?? []).length + (bodyText.match(SOURCE) ?? []).length;
  const citationDensity = wordCount > 0 ? Math.round(wordCount / Math.max(citations, 1)) : 9999;

  // 10. Meta description.
  const metaDesc = $('meta[name="description"]').attr("content")?.trim() ?? "";
  const pageTitle = $("title").text().trim();
  const metaDescPoor =
    !metaDesc || metaDesc.length < 50 || metaDesc.length > 160 || metaDesc === pageTitle || /\.\.\.$/.test(metaDesc);

  const issues: Issue[] = [];
  const add = (issue_type: string, severity: Issue["severity"], details: string) =>
    issues.push({ url, issue_type, severity, details, date_found: dateFound, status: "open" });

  if (foundSchemas.length === 0) add("geo_no_schema", "warning", "No structured data (JSON-LD) found");
  if (paragraphQualityPct < 30)
    add("geo_poor_paragraph_structure", "warning", `Only ${paragraphQualityPct}% of paragraphs are 2-3 sentences (target: 50%+)`);
  if (h2s.length > 0 && questionHeadingPct < cfg.questionHeadingTargetPct)
    add("geo_few_question_headings", "info", `${questionHeadingPct}% question-based H2s (target: ${cfg.questionHeadingTargetPct}%+)`);
  if (h2s.length > 0 && directAnswerPct < 30)
    add("geo_no_direct_answers", "info", `${directAnswerPct}% H2s have direct answers (40-60 word first paragraph)`);
  if (contentAgeDays > cfg.freshnessThresholdDays)
    add("geo_stale_content", "warning", `Content is ${contentAgeDays} days old (threshold: ${cfg.freshnessThresholdDays})`);
  if (contentAgeDays === -1 && article) add("geo_no_date", "warning", "Article has no datePublished/dateModified");
  // Only articles carry an author; the home page and landing pages legitimately have none.
  if (article && !hasAuthor) add("geo_no_author", "warning", "No author information found");
  if (hasAuthor && authorType === "Organization")
    add("geo_author_not_person", "info", "Author is Organization instead of Person (E-E-A-T signal)");
  if (!hasFaq) add("geo_no_faq", "info", "No FAQ section or FAQPage schema found");
  if (bodyTextLength < 200)
    add("geo_ssr_issue", "info", `Only ${bodyTextLength} chars in static HTML: AI bots that don't run JS will see empty content`);
  if (citationDensity > cfg.targetCitationsPerWords * 1.5)
    add("geo_low_citations", "warning", `1 citation per ${citationDensity} words (target: 1 per ${cfg.targetCitationsPerWords})`);
  if (metaDescPoor) {
    const why = !metaDesc ? "missing" : metaDesc.length < 50 ? "too short" : metaDesc.length > 160 ? "too long" : "auto-generated/truncated";
    add("geo_meta_description_poor", "warning", `Meta description is ${why}`);
  }

  // Score: schema 15, paragraphs 10, questions 10, direct answers 10,
  // freshness 15, author 10, FAQ 5, citations 10 (+15 bot access at site level).
  let score = Math.min(foundSchemas.length / 2, 1) * 15;
  score += Math.min(paragraphQualityPct / 50, 1) * 10;
  score += Math.min(questionHeadingPct / cfg.questionHeadingTargetPct, 1) * 10;
  score += Math.min(directAnswerPct / 50, 1) * 10;
  if (contentAgeDays >= 0 && contentAgeDays <= cfg.freshnessThresholdDays) score += 15;
  else if (contentAgeDays >= 0 && contentAgeDays <= cfg.freshnessThresholdDays * 2) score += 7;
  if (hasAuthor) score += authorType === "Person" ? 10 : 5;
  if (hasFaqSchema) score += 5;
  else if (hasFaqHtml) score += 2;
  if (citationDensity <= cfg.targetCitationsPerWords) score += 10;
  else if (citationDensity <= cfg.targetCitationsPerWords * 2) score += 5;

  return {
    issues,
    rawScore: Math.round(score),
    scorecard: {
      url,
      page_title: pageTitle,
      geo_score: 0,
      bots_accessible: "",
      schema_types: foundSchemas.join(", "),
      paragraph_quality_pct: `${paragraphQualityPct}%`,
      question_headings_pct: `${questionHeadingPct}%`,
      direct_answers_pct: `${directAnswerPct}%`,
      content_age_days: contentAgeDays >= 0 ? String(contentAgeDays) : "unknown",
      has_author: hasAuthor ? "yes" : "no",
      has_faq: hasFaq ? "yes" : "no",
      citation_density: `1/${citationDensity}`,
      last_audited: dateFound,
    },
  };
}
