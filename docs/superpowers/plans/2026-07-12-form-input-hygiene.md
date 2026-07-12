# Quote Form Input Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch email typos (`gmail.con` → click-to-accept suggestion) and normalize names (trim + smart Title-Case) at the source in QuoteForm and ContactForm, with a server-side name backstop.

**Architecture:** One shared pure module `src/lib/form-hygiene.ts` (`normalizeName`, `suggestEmailCorrection`) consumed by both forms on the client and by the storage layer on the server. Email correction is a non-blocking suggestion; name normalization runs on blur (client) and again in `createOrUpdateFormUser` (server backstop). No new dependency.

**Tech Stack:** TypeScript, React 19 client components, Next.js, Directus storage layer.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-12-form-input-hygiene-design.md`.
- Repo has NO test framework. Verify with `npx tsc --noEmit` + `npx eslint <files>`; behavior confirmed via the example tables here and a manual UI pass.
- Scope: QuoteForm (`src/components/quote/QuoteForm.tsx`) + ContactForm (`src/components/ContactForm.tsx`) + server backstop (`src/lib/directus-storage.ts`). MiniQuoteForm untouched.
- Email suggestion is CLIENT-ONLY; the server never auto-changes an email.
- `normalizeName`: trim + collapse whitespace; Title-Case ONLY if the string is all-lowercase or all-uppercase (letters only); otherwise leave unchanged (preserve `McDonald`). Idempotent.
- `suggestEmailCorrection`: returns null unless the email matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`; TLD-typo map is unambiguous only (never touches valid TLDs like `.co`); domain near-miss is Levenshtein ≤ 1 against a curated known-domain list, and ambiguous ties yield null.
- i18n: use QuoteForm's `tqOpt(key)` (returns undefined when missing) and ContactForm's `d(key, defaultString)` overload, with hardcoded fr/de fallback (`lang === "de" ? "Meinten Sie" : "Vouliez-vous dire"`).
- Deploy via staging→main after all tasks pass.

---

### Task 1: Shared `form-hygiene` module

**Files:**
- Create: `src/lib/form-hygiene.ts`

**Interfaces:**
- Produces:
  - `normalizeName(raw: string): string`
  - `suggestEmailCorrection(email: string): string | null`

- [ ] **Step 1: Create the module**

```ts
// Pure form-input hygiene helpers. No browser/framework deps — safe on client
// and server.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim + collapse whitespace, then Title-Case ONLY if the input is all-lower
 * or all-upper (letters only). Mixed-case input is returned trimmed but
 * otherwise unchanged, preserving intentional casing like "McDonald".
 * Idempotent.
 */
export function normalizeName(raw: string): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  const letters = s.replace(/[^\p{L}]/gu, "");
  const isAllLower = letters.length > 0 && letters === letters.toLowerCase();
  const isAllUpper = letters.length > 0 && letters === letters.toUpperCase();
  if (!isAllLower && !isAllUpper) return s;
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

// Curated known domains (Swiss + global) for near-miss detection.
const KNOWN_DOMAINS = [
  "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
  "msn.com", "yahoo.com", "yahoo.fr", "icloud.com", "me.com", "proton.me",
  "protonmail.com", "gmx.ch", "gmx.net", "bluewin.ch", "hispeed.ch",
  "sunrise.ch", "swissonline.ch", "windowslive.com",
];

// Unambiguous TLD typos only — never includes valid TLDs like "co".
const TLD_TYPOS: Record<string, string> = {
  con: "com", cmo: "com", comm: "com", vom: "com", xom: "com",
  ney: "net", nte: "net",
  chh: "ch",
};

/** Levenshtein distance; early-exits at 2 (we only care about <= 1). */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prev = tmp;
    }
  }
  return dp[m];
}

/**
 * Suggest a corrected email when the domain looks like a typo of a common
 * provider. Returns the full corrected address, or null when nothing to fix.
 * Never rewrites automatically — callers surface it as a suggestion.
 */
export function suggestEmailCorrection(email: string): string | null {
  const value = (email ?? "").trim();
  if (!EMAIL_RE.test(value)) return null;

  const at = value.lastIndexOf("@");
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();

  if (KNOWN_DOMAINS.includes(domain)) return null;

  // 1) TLD typo (exact map).
  const lastDot = domain.lastIndexOf(".");
  if (lastDot > 0) {
    const tld = domain.slice(lastDot + 1);
    const fixedTld = TLD_TYPOS[tld];
    if (fixedTld) {
      const fixed = `${local}@${domain.slice(0, lastDot + 1)}${fixedTld}`;
      return fixed !== value ? fixed : null;
    }
  }

  // 2) Domain near-miss (Levenshtein <= 1, unique).
  let best: string | null = null;
  let bestDist = 99;
  let tie = false;
  for (const known of KNOWN_DOMAINS) {
    const dist = levenshtein(domain, known);
    if (dist < bestDist) {
      bestDist = dist;
      best = known;
      tie = false;
    } else if (dist === bestDist) {
      tie = true;
    }
  }
  if (best && bestDist <= 1 && !tie) {
    const fixed = `${local}@${best}`;
    return fixed !== value ? fixed : null;
  }

  return null;
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/form-hygiene.ts`
Expected: no errors.

- [ ] **Step 3: Trace the behavior table (logic verification, no test framework)**

Confirm by reading the code that these hold. If any disagree, fix the code.

`normalizeName`:
| input | output |
|---|---|
| `"sina"` | `"Sina"` |
| `"MIRRAZAVI"` | `"Mirrazavi"` |
| `"mirrazavi "` | `"Mirrazavi"` |
| `"McDonald"` | `"McDonald"` |
| `"van der berg"` | `"Van Der Berg"` |
| `""` | `""` |

`suggestEmailCorrection`:
| input | output |
|---|---|
| `"sina@gmail.con"` | `"sina@gmail.com"` |
| `"x@gmial.com"` | `"x@gmail.com"` |
| `"x@bluewin.ch"` | `null` (exact known) |
| `"x@gmail.com"` | `null` (exact known) |
| `"x@some-company.co"` | `null` (`.co` valid, not touched) |
| `"notanemail"` | `null` (fails regex) |

- [ ] **Step 4: Commit**

```bash
git add src/lib/form-hygiene.ts
git commit -m "feat(forms): shared form-hygiene module (normalizeName, suggestEmailCorrection)"
```

---

### Task 2: Wire QuoteForm

**Files:**
- Modify: `src/components/quote/QuoteForm.tsx` (import; name inputs ~1185-1212; email block ~1215-1230)

**Interfaces:**
- Consumes: `normalizeName`, `suggestEmailCorrection` from `@/lib/form-hygiene`.

- [ ] **Step 1: Import the helpers**

Add to the imports at the top of `src/components/quote/QuoteForm.tsx`:
```ts
import { normalizeName, suggestEmailCorrection } from "@/lib/form-hygiene";
```

- [ ] **Step 2: Add onBlur normalization to both name inputs**

On the `firstName` `<Input>` (currently only `onChange`), add:
```tsx
                        onChange={(e) => handleFieldChange("firstName", e.target.value)}
                        onBlur={(e) => handleFieldChange("firstName", normalizeName(e.target.value))}
```
Do the identical addition on the `lastName` `<Input>`:
```tsx
                        onChange={(e) => handleFieldChange("lastName", e.target.value)}
                        onBlur={(e) => handleFieldChange("lastName", normalizeName(e.target.value))}
```

- [ ] **Step 3: Add the email suggestion line**

Immediately after the existing email-error `<p>` (the `{formData.email && !isEmailValid && (...)}` block), add a suggestion block. Compute the suggestion inline:

```tsx
                    {formData.email && !isEmailValid && (
                      <p className="text-xs text-destructive mt-1">{tq("steps.contact.fields.email.error")}</p>
                    )}
                    {isEmailValid && suggestEmailCorrection(formData.email) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {tqOpt("steps.contact.fields.email.suggestion") ?? (lang === "de" ? "Meinten Sie" : "Vouliez-vous dire")}{" "}
                        <button
                          type="button"
                          className="font-medium text-primary underline underline-offset-2"
                          onClick={() => handleFieldChange("email", suggestEmailCorrection(formData.email)!)}
                        >
                          {suggestEmailCorrection(formData.email)}
                        </button>
                        {" ?"}
                      </p>
                    )}
```

(`tqOpt` and `lang` already exist in this component. `isEmailValid` already exists. The `!` is safe because the block only renders when `suggestEmailCorrection(...)` is truthy.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/quote/QuoteForm.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/quote/QuoteForm.tsx
git commit -m "feat(quote): name normalization on blur + email typo suggestion"
```

---

### Task 3: Wire ContactForm

**Files:**
- Modify: `src/components/ContactForm.tsx` (import; name inputs ~260-290; email block ~318+)

**Interfaces:**
- Consumes: `normalizeName`, `suggestEmailCorrection` from `@/lib/form-hygiene`.

- [ ] **Step 1: Import the helpers**

Add to the imports at the top of `src/components/ContactForm.tsx`:
```ts
import { normalizeName, suggestEmailCorrection } from "@/lib/form-hygiene";
```

- [ ] **Step 2: Add normalization to both name inputs (preserving telemetry)**

The name inputs already have `onBlur={() => telemetry.trackBlur("firstName")}`. Extend each to also normalize. For `firstName`:
```tsx
        onBlur={(e) => { telemetry.trackBlur("firstName"); handleFieldChange("firstName", normalizeName(e.target.value)); }}
```
For `lastName`:
```tsx
        onBlur={(e) => { telemetry.trackBlur("lastName"); handleFieldChange("lastName", normalizeName(e.target.value)); }}
```

- [ ] **Step 3: Add the email suggestion line**

Find the email `<Input>` block (it renders `{d(`${P}.form.email`)}` label and has `type="email"`). After the email input's closing tag and any existing email error element within that `<div>`, add:
```tsx
        {isEmailValid && suggestEmailCorrection(formData.email) && (
          <p className="text-xs text-muted-foreground mt-1">
            {d(`${P}.form.emailSuggestion`, lang === "de" ? "Meinten Sie" : "Vouliez-vous dire")}{" "}
            <button
              type="button"
              className="font-medium text-primary underline underline-offset-2"
              onClick={() => handleFieldChange("email", suggestEmailCorrection(formData.email)!)}
            >
              {suggestEmailCorrection(formData.email)}
            </button>
            {" ?"}
          </p>
        )}
```

(`d(key, defaultString)` returns the default when the key is missing — see `ContactForm.tsx:57-58`. `isEmailValid`, `lang`, `P`, and `handleFieldChange` already exist in this component.)

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/components/ContactForm.tsx`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactForm.tsx
git commit -m "feat(contact): name normalization on blur + email typo suggestion"
```

---

### Task 4: Server-side name backstop

**Files:**
- Modify: `src/lib/directus-storage.ts` (`createOrUpdateFormUser`)

**Interfaces:**
- Consumes: `normalizeName` from `@/lib/form-hygiene`.

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `src/lib/directus-storage.ts`:
```ts
import { normalizeName } from "@/lib/form-hygiene";
```

- [ ] **Step 2: Normalize names in both branches of `createOrUpdateFormUser`**

In the PATCH branch, change the `first_name` / `last_name` lines:
```ts
            first_name: (data.first_name ? normalizeName(data.first_name) : "") || user.first_name,
            last_name: (data.last_name ? normalizeName(data.last_name) : "") || user.last_name,
```
In the POST branch, change:
```ts
          first_name: data.first_name ? normalizeName(data.first_name) : data.first_name,
          last_name: data.last_name ? normalizeName(data.last_name) : data.last_name,
```
(This preserves the existing "keep prior value if empty" behavior in PATCH and the null/empty pass-through in POST, only normalizing non-empty names.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/directus-storage.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/directus-storage.ts
git commit -m "feat(storage): normalize names server-side as a backstop"
```

- [ ] **Step 5: Manual end-to-end verification (controller, after deploy)**

On staging: in both QuoteForm and ContactForm, type `sina@gmail.con` → confirm the suggestion `sina@gmail.com` appears and clicking it fills the field; type `sina` / `MIRRAZAVI ` in the name fields and blur → confirm `Sina` / `Mirrazavi`. Then submit a lead (test email) with lowercase names *without blurring* and confirm the stored `form_users` row shows Title-Cased, trimmed names (server backstop).

---

## Self-Review

**Spec coverage:**
- `normalizeName` (trim + smart Title-Case, idempotent) → Task 1. ✓
- `suggestEmailCorrection` (regex gate, TLD map unambiguous, Levenshtein ≤1, tie→null, exact-known→null) → Task 1. ✓
- QuoteForm name onBlur + email suggestion (tqOpt + fr/de fallback) → Task 2. ✓
- ContactForm name onBlur preserving telemetry + email suggestion (`d` default overload) → Task 3. ✓
- Server backstop in `createOrUpdateFormUser` → Task 4. ✓
- Email client-only (server never changes email) → Task 4 touches only names. ✓
- i18n fallback (key missing → hardcoded fr/de) → Tasks 2-3 use the codebase's actual missing-key-safe helpers. ✓

**Placeholder scan:** No TBD/TODO. Behavior tables are concrete input/output pairs, not placeholders.

**Type consistency:** `normalizeName(raw: string): string` and `suggestEmailCorrection(email: string): string | null` defined in Task 1, imported/called with those exact signatures in Tasks 2-4. QuoteForm uses `tqOpt` + `lang` (both exist, verified); ContactForm uses `d(key, default)` + `lang` + `P` (all exist, verified); both use the pre-existing `isEmailValid` and `handleFieldChange`.
