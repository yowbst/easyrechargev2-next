/**
 * One-shot: partner_dispatches.disqualified and .gift are null on rows written
 * before the columns had defaults. Null breaks every boolean filter. Set them
 * to false. Idempotent — re-running matches nothing.
 *
 * Dry run:  npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts
 * Apply:    npx tsx --env-file=.env.local scripts/backfill-dispatch-booleans.ts --apply
 */
import { directusFetch } from "@/lib/directus";

interface Row { id: string; disqualified: boolean | null; gift: boolean | null }

async function main() {
  const dryRun = !process.argv.includes("--apply");

  const params = new URLSearchParams();
  params.set("fields", "id,disqualified,gift");
  params.set("filter[_or][0][disqualified][_null]", "true");
  params.set("filter[_or][1][gift][_null]", "true");
  params.set("limit", "1000");

  const res = await directusFetch<{ data: Row[] }>(
    `/items/partner_dispatches?${params}`,
    { next: { revalidate: 0 } },
  );
  const rows = res?.data ?? [];
  console.log(`${rows.length} row(s) with a null boolean`);

  if (dryRun) {
    console.log("dry run — pass --apply to write");
    return;
  }

  for (const r of rows) {
    const patch: Record<string, boolean> = {};
    if (r.disqualified === null) patch.disqualified = false;
    if (r.gift === null) patch.gift = false;
    await directusFetch(`/items/partner_dispatches/${r.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
      next: { revalidate: 0 },
    });
    console.log(`patched ${r.id}`, patch);
  }
  console.log(`done — ${rows.length} row(s) updated`);
}

main().catch((e) => { console.error(e); process.exit(1); });
