/**
 * One-off: align the July 2026 dispatch stages with the reasons they were
 * dropped for, and remove the QA test lead.
 *
 * The partner route cannot do either of these — it refuses a disqualified row
 * and refuses a backward move — so the moves go through adminSetStage.
 * Run with `npx tsx --env-file=.env.local scripts/july-triage.ts [--apply]`.
 */
import { directusFetch } from "../src/lib/directus";
import { adminSetStage } from "../src/lib/dispatch/admin-override";
import type { DispatchStage } from "../src/lib/dispatch/types";

const APPLY = process.argv.includes("--apply");
// The deletion is irreversible and wider than the board row, so it is gated
// on its own flag rather than riding along with the stage moves.
const DO_DELETE = process.argv.includes("--delete-qa-lead");
// The moves are not idempotent — a second run re-stamps stage_entered_at and
// appends a duplicate history entry — so they can be skipped once applied.
const SKIP_MOVES = process.argv.includes("--skip-moves");

const MOVES: { id: string; who: string; to: DispatchStage; why: string }[] = [
  {
    id: "c35399b1-9ab9-4fc0-a7d5-4074ed472f03",
    who: "Philippe Munier",
    to: "contacted",
    why: "long_timeframe ne s'obtient qu'après contact",
  },
  {
    id: "4704266d-fb58-4953-a05b-0eaa52e346e4",
    who: "Alain Dizerens",
    to: "appointment",
    why: "RDV pris avant l'annulation du projet",
  },
  {
    id: "3b102227-69ac-4e0a-9794-f7dc1f18f9e4",
    who: "Vincent Balegno",
    to: "new",
    why: "injoignable — le contact n'a jamais abouti",
  },
  {
    id: "a4be4d59-a60b-4b95-b6ae-1a2e302da0a3",
    who: "Ricardo Matias",
    to: "contacted",
    why: "infaisabilité constatée après contact",
  },
];

// QA lead lead.dispatch.qa@proton.me — children first, one submission only.
const DELETE_CHAIN: [string, string][] = [
  ["partner_dispatches", "d3ba1e4e-d77d-488f-9e9b-c7e93e269a2c"],
  ["form_submissions", "ca1221c9-8564-4758-b4d3-454648f89ca7"],
  ["form_sessions", "914f301e-6dd4-464b-b349-ca9767cef530"],
  ["form_users", "e51cccd5-d2c7-48df-b7e1-b90d4dbeaa01"],
];

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (pass --apply) ===");

  for (const m of SKIP_MOVES ? [] : MOVES) {
    if (!APPLY) {
      console.log(`  move ${m.who} -> ${m.to} (${m.why})`);
      continue;
    }
    const r = await adminSetStage(m.id, m.to, `tri juillet — ${m.why}`);
    console.log(`  ${m.who}: ${r.from} -> ${r.to}`);
  }

  if (!DO_DELETE) {
    console.log("  (QA lead left in place — pass --delete-qa-lead)");
    return;
  }
  for (const [coll, id] of DELETE_CHAIN) {
    if (!APPLY) {
      console.log(`  delete ${coll}/${id}`);
      continue;
    }
    try {
      await directusFetch(`/items/${coll}/${id}`, {
        method: "DELETE",
        next: { revalidate: 0 },
      });
      console.log(`  deleted ${coll}/${id}`);
    } catch (e) {
      console.log(`  FAILED ${coll}/${id}: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
