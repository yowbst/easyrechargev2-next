import Handlebars from "handlebars";

// Renders the email design (emails/email-template.hbs.html) into the static
// HTML a Make e-mail module sends. Make has no Handlebars, so the template is
// compiled here and Make's own expressions are inserted afterwards: content
// files reference them as %name% (see emails/make/tokens.json), which
// Handlebars leaves untouched and never HTML-escapes — a Make formula such as
// {{if(1.submission.product = "battery"; …)}} must keep its raw quotes.

export interface EmailToken {
  /** Make expression inserted in the module, e.g. "{{1.user.firstName}}". */
  make: string;
  /** Realistic value for the local preview. */
  sample: string;
}

export type EmailTokens = Record<string, EmailToken>;
export type TokenMode = "make" | "sample";

export interface Slas {
  first_contact: string | number;
  quote_delivery_timeline: string | number;
}

const TOKEN = /%([A-Za-z][A-Za-z0-9]*)%/g;

/** Replace %name% tokens in already rendered text. Throws on an unknown token. */
export function substituteTokens(text: string, tokens: EmailTokens, mode: TokenMode): string {
  return text.replace(TOKEN, (_, name: string) => {
    const token = tokens[name];
    if (!token) throw new Error(`Unknown email token %${name}%`);
    return token[mode];
  });
}

/** Fill {first_contact} / {quote_delivery_timeline} in every string of the data. */
export function interpolateSlas<T>(value: T, slas: Slas): T {
  if (typeof value === "string") {
    return value
      .replaceAll("{first_contact}", String(slas.first_contact))
      .replaceAll("{quote_delivery_timeline}", String(slas.quote_delivery_timeline)) as T;
  }
  if (Array.isArray(value)) return value.map((v) => interpolateSlas(v, slas)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, interpolateSlas(v, slas)]),
    ) as T;
  }
  return value;
}

export function renderEmail(
  template: string,
  data: Record<string, unknown> & { subject: string },
  tokens: EmailTokens,
  mode: TokenMode,
  slas: Slas,
): { subject: string; html: string } {
  const filled = interpolateSlas(data, slas);
  // Handlebars also escapes "=" (&#x3D;); decoded by browsers, but kept plain
  // so query strings stay readable in every mail client.
  const html = Handlebars.compile(template)(filled).replaceAll("&#x3D;", "=");
  return {
    subject: substituteTokens(filled.subject, tokens, mode),
    html: substituteTokens(html, tokens, mode),
  };
}
