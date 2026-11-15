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
Directus token is used to download the reference photos, and by `publish`.

## Sequence

1. **Generate options.** Describe the subject only. The style, framing and references come
   from the preset.

   ```
   npm run images -- generate home-block "A PPE underground car park with three wall-mounted chargers…" --n 3
   ```

   Each option lands in `.images/review/` and gets a manifest line with model, full prompt,
   reference ids, real cost (`usage.cost`) and output path. The first run downloads the
   reference photos into `.images/refs/` (`npm run images -- refs` does only that).
2. **Review.** Open the options, pick one. Check that there is no text or logo, no odd
   hardware, and nothing that could pass for a real customer's home.
3. **Edit (optional).** One minimal change per pass, on the chosen file:

   ```
   npm run images -- edit .images/review/<file>.png "Remove the second cable on the left wall"
   ```

   The edit is written next to the source as `<file>-edit-<stamp>-1.png` and logged with its
   source.
4. **Show Yoan.** Nothing goes further without his explicit go.
5. **Publish.** Check with `--dry-run` first, which prints what would be sent and uploads nothing:

   ```
   npm run images -- publish .images/review/<file>.png --title "Batterie au garage" --dry-run
   npm run images -- publish .images/review/<file>.png --title "Batterie au garage"
   ```

   The image is converted to JPEG at quality 85 (with sharp, bundled with Next; if sharp is
   missing the file goes up unconverted and Directus transforms it on delivery). The title
   gets " (illustration)" appended. The command prints the new asset id. Put that id into the
   Directus content yourself.

## Regenerating

`npm run images -- regenerate <manifest-id>` reruns an entry with its own model, prompt and
references (an edit entry reruns the edit on its source, if the file is still there). The
models are not deterministic, so you get the same scene in the same style, not the same pixels.

Regression example: `battery-2026-11-15`, the homepage battery image (#15) made by hand
before the pipeline existed. Regenerated on 2026-11-15 for $0.0688
(`home-block-20261115-143513-1`), with an edit pass for $0.0677. Both runs are in the manifest.

## Costs

`google/gemini-3.1-flash-image` with three references costs about **$0.07 per generation or
edit** (logged per line in the manifest). A typical image costs $0.20–0.35: three options,
then one or two edits.

## Gotchas

- The gateway call is `POST https://ai-gateway.vercel.sh/v1/chat/completions` with
  `modalities: ["text","image"]`. The image comes back as a data URL in
  `choices[0].message.images[0].image_url.url`. If it is missing, the script stops and prints
  what the model said instead (usually a refusal).
- Only chat-completions image models are wired. The `openai/gpt-image-2` fallback in the
  ticket uses `/v1/images/generations` and `/v1/images/edits`, which are not implemented yet.
  Setting it as a preset's `model` will fail.
- The 2026-11-15 prompt is pinned by a unit test: `brand/image-presets.json` style +
  `home-block` framing must reproduce it word for word. If you change the style, update the
  test on purpose.
- Changing the reference set changes every future image. Note the change in the PR and get
  it approved like the style.
