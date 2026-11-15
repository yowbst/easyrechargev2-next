/**
 * llms.txt builder (https://llmstxt.org): a curated Markdown map of the site
 * for AI crawlers. Pure functions; the data comes from `llms-data.ts`.
 */
import { truncate } from "./resolver";

export interface LlmsLink {
  title: string;
  url: string;
  description?: string;
}

export interface LlmsSection {
  heading: string;
  links: LlmsLink[];
  /** Rendered as `###` groups under the section, e.g. guides per category. */
  groups?: { heading: string; links: LlmsLink[] }[];
}

export interface LlmsInput {
  name: string;
  summary: string;
  details: string[];
  sections: LlmsSection[];
}

/**
 * CMS text to one plain line: tags stripped, whitespace collapsed, brand suffix
 * dropped. Text that still holds an unresolved `{f:...}` placeholder is
 * discarded rather than shown to a crawler half-filled.
 */
export function cleanText(raw: unknown, max = 160): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\|\s*easyRecharge\s*$/i, "")
    .trim();
  if (!text || /\{[a-z]+:[^}]*\}/i.test(text)) return undefined;
  return truncate(text, max);
}

const line = (l: LlmsLink) => `- [${l.title}](${l.url})${l.description ? `: ${l.description}` : ""}`;

export function buildLlmsTxt({ name, summary, details, sections }: LlmsInput): string {
  const out = [`# ${name}`, "", `> ${summary}`, ""];
  if (details.length) out.push(...details, "");
  for (const section of sections) {
    if (!section.links.length && !section.groups?.some((g) => g.links.length)) continue;
    out.push(`## ${section.heading}`, "");
    if (section.links.length) out.push(...section.links.map(line), "");
    for (const group of section.groups ?? []) {
      if (!group.links.length) continue;
      out.push(`### ${group.heading}`, "", ...group.links.map(line), "");
    }
  }
  return out.join("\n").trimEnd() + "\n";
}
