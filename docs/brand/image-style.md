# House style for site images

> **DRAFT, waiting for Yoan's approval.** Nothing here is binding until Yoan signs it off
> (issue #16). The reference photos listed below need the same approval.

Every AI-generated image on easyrecharge.ch follows this style, so a new image sits next to
the existing hero, "La borne" and PPE photos without looking out of place. The machine-readable
version is `brand/image-presets.json`, which the generator (`npm run images`) sends on every call.

## Look

- **Genre:** documentary architectural photography. It should look like a real photograph,
  not a render or an illustration.
- **Camera:** eye level, 35 mm lens, steady and straight verticals.
- **Light:** soft natural light, at dawn/early morning or late afternoon. No harsh midday sun,
  no studio lighting, no night scenes.
- **Palette and materials:** raw concrete grey, warm oak wood, deep greens. Muted, never
  saturated. Realistic materials.
- **Setting:** Swiss residential: detached houses, PPE buildings, garages, driveways, green
  hills behind.
- **Mood:** calm and tidy. Cables run in conduits, nothing is cluttered.
- **People:** none.
- **Text:** no text, no lettering, no brand logos, including on the chargers, batteries and cars.

## Framing per slot

| Preset | Aspect | Use |
|---|---|---|
| `home-block` | 16:10 | Homepage blocks (PPE / battery / solar layout) |
| `hero` | 16:9 | Page heroes: subject on the right, calm left half for the headline |
| `blog-cover` | 1.91:1 | Blog covers and social sharing |

## Reference photos

These Directus assets go with every generation as style references. Their ids are in
`brand/image-presets.json`; the generator downloads them into `.images/refs/` (gitignored).
No image files are committed.

| Directus asset | What it shows |
|---|---|
| `475a06f4-9320-4452-b5ce-595a05726781` | Hero, dawn driveway |
| `e6b712f2-8bc0-4e81-9b4a-83179173b0aa` | Hero, open garage |
| `6d4a6a91-7eaa-451f-9de8-fafe66427a79` | "La borne" product shot |
| `b8b2addb-273c-4aa4-88c3-b25e31cc6e10` | PPE, underground car park |

Add a photo to the set only once it is approved and live on the site. Three to five
references work best.

## Rules

1. **Illustrative images only.** Never present an image as a real customer, installation or
   partner, in captions, alt text or copy.
2. **No personal or lead data in prompts.** No names, addresses, or details from a quote
   request, ever. Prompts describe generic scenes.
3. **Nothing goes to Directus without Yoan's explicit go.** `publish` is the only command that
   writes, and its Directus title always ends in "(illustration)".
