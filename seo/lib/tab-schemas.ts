/** Header rows for the Google Sheets tabs, shared by every audit command. */

export const SITE_HEALTH_HEADERS = [
  "url", "page_title",
  // GEO
  "geo_score", "geo_schema_types", "geo_question_headings_pct", "geo_direct_answers_pct",
  "geo_citation_density", "geo_has_author", "geo_has_faq", "geo_content_age_days", "geo_bots_accessible",
  // Spin
  "spin_score", "spin_word_count", "spin_unique_content_pct", "spin_editorial_richness",
  "spin_has_faq", "spin_has_intro", "spin_has_guide", "spin_priority", "spin_suggested_actions",
  // PSI
  "psi_mobile_performance", "psi_mobile_seo", "psi_mobile_LCP", "psi_mobile_CLS", "psi_mobile_TBT",
  "psi_desktop_performance", "psi_desktop_seo", "psi_desktop_LCP", "psi_desktop_CLS", "psi_desktop_TBT",
  // Crawl
  "crawl_status", "crawl_has_title", "crawl_has_meta_desc", "crawl_has_canonical", "crawl_has_h1",
  // Timestamps
  "last_geo_audit", "last_spin_audit", "last_psi_audit", "last_crawl",
];

export const SCORE_HISTORY_HEADERS = ["date", "url", "audit_type", "score", "detail_json"];

export const ISSUES_HEADERS = [
  "url", "issue_type", "severity", "category", "details", "fix_prompt", "date_found", "status",
];

/**
 * What ChatGPT / Gemini cite for the frozen prompts. One row per prompt, engine
 * and run; `searched` is "no" when the assistant answered from memory (nothing to cite).
 */
export const AI_CITATIONS_HEADERS = [
  "date", "run", "prompt", "engine", "searched", "cited_domains", "easyrecharge_cited", "rank",
];
