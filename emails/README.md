# Transactional e-mails

One design, many e-mails. The design comes from the claude.ai Design project
"Direction B" (`08 Email - Template.dc.html`, file `emails/email-template.hbs.html`),
copied here unchanged.

## Files

| File | Role |
|---|---|
| `email-template.hbs.html` | The design: Handlebars, tables + inline styles, Outlook button, dark mode, hidden preheader. Optional blocks: `details`, `steps`, `note`, `cta`, `secondary`, `audienceLabel`, `unsubscribeUrl`. |
| `make/common.json` | Per-language blocks shared by every e-mail (logo, signature, help, footer links, company). |
| `make/tokens.json` | `%name%` → Make expression (`{{1.user.firstName}}`, `{{if(1.submission.product = …)}}`) + a sample value for previews. |
| `make/<email>.json` | One e-mail: Make module id per language, then subject, preheader and content per language. |

Strings may contain `{first_contact}` and `{quote_delivery_timeline}`: filled at build
time from Directus `site_settings.global_config.slas`, the values the success page shows.

## Commands

```bash
npm run emails -- build   # emails/dist/make/<module>-…html (sent by Make) + emails/dist/preview/ (sample data)
npm run emails -- push    # build, back up the blueprint to emails/.backups/, write subject + HTML into the Make modules, read back
```

`push` writes to the production Make scenario "eR | P / Demande de devis" (3542973) and
needs `MAKE_API_TOKEN` in `.env.local`. **Never edit these e-mails in the Make UI** — the
next push overwrites them. After a change in Directus SLAs, run `push` again.

## Rules

- Make expressions go through tokens only, never inline in content: Handlebars would
  HTML-escape their quotes and break the formula.
- An unknown `%token%` fails the build.
- The logo is `public/email/logo-white.png` (300×60, transparent, logo left-aligned), served
  from `https://easyrecharge.ch/email/logo-white.png`. SVG is not shown by Gmail/Outlook.
- Adding an e-mail: a `make/<name>.json` with its module ids; the module must be an
  `email:ActionSendEmail` (push refuses otherwise).
