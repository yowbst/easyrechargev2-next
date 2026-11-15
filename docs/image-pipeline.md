# Image pipeline runbook

Generates site images in the house style (`docs/brand/image-style.md`) through Vercel AI
Gateway, keeps a manifest so any image can be made again, and uploads the chosen one to
Directus once Yoan approves it.

Implementation: `scripts/images.ts` (CLI) + `src/lib/images/pipeline.ts` (pure parts, tested).
Config: `brand/image-presets.json` (style, presets, reference asset ids).
Manifest: `brand/image-manifest.jsonl` (committed, one JSON line per generation or edit).
Review folder and reference cache: `.images/review/`, `.images/refs/` (gitignored).

## Prerequisites

`.env.local` needs `AI_GATEWAY_API_KEY`, `DIRECTUS_URL` and `DIRECTUS_STATIC_TOKEN`. The
gateway key is a dedicated key with a budget cap, used only by this script. The Directus token
is used to download the reference photos, and by `publish --apply`.

The commands and flags are listed once, in `USAGE` (`src/lib/images/pipeline.ts`); any
malformed call prints them.

## Sequence

1. **Generate options.** Describe the subject only. The style, framing and references come
   from the preset.

   ```
   npm run images -- generate home-block "A PPE underground car park with three wall-mounted chargers…" --n 3
   ```

   Each option lands in `.images/review/` and gets a manifest line with model, full prompt,
   reference ids, real cost (`usage.cost`), pixel size and output path. If the image is more
   than 5% off the preset's aspect, the script prints a warning: crop it before publishing. The first run downloads the
   reference photos into `.images/refs/` (`npm run images -- refs` does only that).
2. **Review.** Open the options, pick one. Check that there is no text or logo, no odd
   hardware, and nothing that could pass for a real customer's home.
3. **Edit (optional).** One minimal change per pass, on the chosen file:

   ```
   npm run images -- edit .images/review/<file>.png "Remove the second cable on the left wall"
   ```

   The edit goes to `.images/review/<file>-edit-<stamp>-1.png` (whatever folder the source is
   in) and is logged with its source. It uses the model that made the source, read from the
   manifest; a file that is not in the manifest is refused.
4. **Show Yoan.** Nothing goes further without his explicit go.
5. **Publish.** Read-only by default: without `--apply` the command converts the image and
   prints what it would send, and uploads nothing. Add `--apply` to upload:

   ```
   npm run images -- publish .images/review/<file>.png --title "Batterie au garage"
   npm run images -- publish .images/review/<file>.png --title "Batterie au garage" --apply
   ```

   The image is converted to JPEG at quality 85 with sharp (bundled with Next). If sharp cannot
   load or the conversion fails, the command stops; it never uploads an unconverted file. The
   title gets " (illustration)" appended unless it already ends with it (any case). The command prints the new asset id. Put that id into the
   Directus content yourself.

## Regenerating

`npm run images -- regenerate <manifest-id>` reruns an entry with its own model, prompt and
references (`refIds`, so an entry made with an older reference set keeps it), with the
preset's current framing and aspect. An edit entry reruns the edit on its source, if the file
is still there. The
models are not deterministic, so you get the same scene in the same style, not the same pixels.

Regression example: `battery-2026-11-15`, the homepage battery image (#15) made by hand
before the pipeline existed (its `output` is null: there is no file in the repo; `note`
explains). Regenerated on 2026-11-15 for $0.0688
(`home-block-20261115-143513-1`), with an edit pass for $0.0677. Both runs are in the manifest.

## Costs

`google/gemini-3.1-flash-image` with three references (measured before the fourth, the PPE
car park, was added) costs about **$0.07 per generation or
edit** (logged per line in the manifest). A typical image costs $0.20–0.35: three options,
then one or two edits.

## Gotchas

- The gateway call is `POST https://ai-gateway.vercel.sh/v1/chat/completions` with
  `modalities: ["text","image"]`. The image comes back as a data URL in
  `choices[0].message.images[0].image_url.url`. If it is missing, the script stops and prints
  what the model said instead (usually a refusal).
- **Fallback for photographic realism: `openai/gpt-image-2`.** Set it as a preset's `model`
  in `brand/image-presets.json`. Image-only models (ids starting `openai/` or `bfl/`) go
  through the OpenAI-compatible images API: `POST /v1/images/edits` with the references as
  JSON data URLs (`images: [{ image_url }]`), or `/v1/images/generations` with a `size` taken
  from the aspect when there are none. The image comes back in `data[0].b64_json`. Tested once
  on 2026-11-15 (`home-block-20261115-144514-1`, four references, 1586×992): the gateway
  returned no `usage.cost`, so the manifest logs `cost: null`; check the spend in the Vercel
  dashboard.
- Errors from the gateway and from Directus are printed with the status and the first 500
  characters of the body.
- The 2026-11-15 prompt is pinned by a unit test: `brand/image-presets.json` style +
  `home-block` framing must reproduce it word for word. If you change the style, update the
  test on purpose.
- Changing the reference set changes every future image. Note the change in the PR and get
  it approved like the style.
