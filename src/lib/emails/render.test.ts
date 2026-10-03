import { describe, expect, it } from "vitest";
import { interpolateSlas, renderEmail, substituteTokens, type EmailTokens } from "./render";

const tokens: EmailTokens = {
  firstName: { make: "{{1.user.firstName}}", sample: "Camille" },
  product: { make: '{{if(1.submission.product = "battery"; "Batterie"; "Borne")}}', sample: "Batterie" },
  url: { make: "{{1.submission.request_url}}", sample: "https://x.ch/r" },
};
const slas = { first_contact: 72, quote_delivery_timeline: "3-5" };
const template =
  '<title>{{subject}}</title><p>{{greeting}}</p>{{#each paragraphs}}<p>{{this}}</p>{{/each}}<a href="{{cta.url}}">{{cta.label}}</a><td style="width:100%">';

describe("renderEmail", () => {
  const data = {
    subject: "Réf. %product%",
    greeting: "Bonjour %firstName%,",
    paragraphs: ["Contact sous {first_contact} h, devis sous {quote_delivery_timeline} jours."],
    cta: { label: "L'accès", url: "%url%?view=client" },
  };

  it("inserts raw Make expressions, quotes included, after the Handlebars render", () => {
    const { subject, html } = renderEmail(template, data, tokens, "make", slas);
    expect(subject).toBe('Réf. {{if(1.submission.product = "battery"; "Batterie"; "Borne")}}');
    expect(html).toContain("<p>Bonjour {{1.user.firstName}},</p>");
    expect(html).toContain('href="{{1.submission.request_url}}?view=client"');
    expect(html).toContain('<title>Réf. {{if(1.submission.product = "battery"; "Batterie"; "Borne")}}</title>');
  });

  it("fills the SLA placeholders and leaves CSS percentages alone", () => {
    const { html } = renderEmail(template, data, tokens, "sample", slas);
    expect(html).toContain("Contact sous 72 h, devis sous 3-5 jours.");
    expect(html).toContain('style="width:100%"');
    expect(html).toContain("<p>Bonjour Camille,</p>");
  });

  it("omits conditional blocks without data", () => {
    const { html } = renderEmail("{{#if note}}NOTE{{/if}}x", { subject: "s" }, tokens, "make", slas);
    expect(html).toBe("x");
  });
});

describe("substituteTokens", () => {
  it("rejects an unknown token instead of shipping it to Make", () => {
    expect(() => substituteTokens("%nope%", tokens, "make")).toThrow("Unknown email token %nope%");
  });
});

describe("interpolateSlas", () => {
  it("walks nested arrays and objects", () => {
    expect(interpolateSlas({ a: ["{first_contact}"], b: { c: "{quote_delivery_timeline}" }, d: 1 }, slas)).toEqual({
      a: ["72"],
      b: { c: "3-5" },
      d: 1,
    });
  });
});
