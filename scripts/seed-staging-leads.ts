/**
 * Seed the STAGING partner board with a realistic spread of leads, so the
 * Kanban's Gagné / Perdu column and the stats page have something to say.
 *
 *   npx tsx --env-file=.env.local scripts/seed-staging-leads.ts          # dry run
 *   npx tsx --env-file=.env.local scripts/seed-staging-leads.ts --apply
 *   npx tsx --env-file=.env.local scripts/seed-staging-leads.ts --purge
 *
 * Two traps this script exists to avoid:
 *
 *  1. `getEnvironment()` reads VERCEL_ENV / the branch name, so it returns
 *     "development" from a local run. Every row here therefore writes
 *     `environment: "staging"` literally — relying on the helper would file
 *     the whole seed under the wrong environment and leave staging empty.
 *  2. Seeded rows are indelibly marked (SEED_TAG in the email and in a note),
 *     and --purge deletes by that marker alone. Test data with no teardown is
 *     how QA leads ended up in the production ledger.
 */
import { directusFetch } from "../src/lib/directus";
import { deriveLeadCategory } from "../src/lib/dispatch/categorize";
import { resolveWeights, scoreLead, resolveScoreBands } from "../src/lib/dispatch/scoring";
import type { DispatchStage, LostReason, DisqualificationReason } from "../src/lib/dispatch/types";

const ENVIRONMENT = "staging" as const;
const PARTNER_ID = "0224e5f4-5bce-4ab1-b00a-fa376ab4aa49"; // E-ME Énergies (staging)
const PRICE_CHF = 40;
const SEED_TAG = "seed-staging";
const EMAIL_DOMAIN = "seed.staging.easyrecharge.invalid";

type Profile = {
  housingStatus: "owner" | "co-owner" | "tenant";
  approval: "" | "yes" | "in-progress" | "no";
  deadline: "asap" | "2-3mo" | "3-6mo" | "6+mo";
  parkingSpotCount: "1" | "2" | "3+";
  solarEquipment: "none" | "in-progress" | "exists";
};

/**
 * Profiles keyed by the score they produce. The values are the modes actually
 * observed in production (min 53, median 88, max 100) — inventing a lead below
 * 50 would be inventing a lead type the funnel never produces.
 */
const P: Record<string, Profile> = {
  s100: { housingStatus: "owner",    approval: "",            deadline: "asap",  parkingSpotCount: "1", solarEquipment: "none" },
  s93:  { housingStatus: "owner",    approval: "",            deadline: "asap",  parkingSpotCount: "1", solarEquipment: "in-progress" },
  s91:  { housingStatus: "owner",    approval: "",            deadline: "2-3mo", parkingSpotCount: "2", solarEquipment: "exists" },
  s88:  { housingStatus: "owner",    approval: "",            deadline: "asap",  parkingSpotCount: "1", solarEquipment: "exists" },
  s80:  { housingStatus: "owner",    approval: "",            deadline: "2-3mo", parkingSpotCount: "1", solarEquipment: "exists" },
  s73:  { housingStatus: "owner",    approval: "",            deadline: "3-6mo", parkingSpotCount: "1", solarEquipment: "exists" },
  s68:  { housingStatus: "owner",    approval: "",            deadline: "6+mo",  parkingSpotCount: "1", solarEquipment: "exists" },
  s62:  { housingStatus: "co-owner", approval: "no",          deadline: "asap",  parkingSpotCount: "1", solarEquipment: "exists" },
  s54:  { housingStatus: "tenant",   approval: "in-progress", deadline: "3-6mo", parkingSpotCount: "1", solarEquipment: "in-progress" },
};

interface Seed {
  first: string;
  last: string;
  /** yyyy-mm-dd */
  day: string;
  canton: string;
  locality: string;
  postalCode: string;
  profile: Profile;
  /** The funnel stage the lead sits in. Disqualification is orthogonal. */
  stage: DispatchStage;
  lostReason?: LostReason;
  /** Set to also mark the lead disqualified at `stage`. */
  disqualified?: DisqualificationReason;
}

/**
 * Dispatched across June–September so monthlyVolume and the score sparkline
 * have four points, and so the 30-day "won" maturity gate lets the older
 * cohorts into the conversion denominator while September's stay pending.
 */
const SEEDS: Seed[] = [
  // ── Juin : cohorte mûre, entièrement jouée ────────────────────────────
  { first: "Nicolas",   last: "Aebischer", day: "2026-06-03", canton: "VD", locality: "Morges",      postalCode: "1110", profile: P.s100, stage: "won" },
  { first: "Sandra",    last: "Bovet",     day: "2026-06-05", canton: "VD", locality: "Nyon",        postalCode: "1260", profile: P.s88,  stage: "won" },
  { first: "Olivier",   last: "Chuard",    day: "2026-06-09", canton: "GE", locality: "Carouge",     postalCode: "1227", profile: P.s73,  stage: "lost", lostReason: "price" },
  { first: "Isabelle",  last: "Dubois",    day: "2026-06-12", canton: "FR", locality: "Bulle",       postalCode: "1630", profile: P.s68,  stage: "lost", lostReason: "competitor" },
  { first: "Pascal",    last: "Emery",     day: "2026-06-16", canton: "VD", locality: "Aigle",       postalCode: "1860", profile: P.s93,  stage: "quote_sent" },
  { first: "Carole",    last: "Favre",     day: "2026-06-19", canton: "NE", locality: "Neuchâtel",   postalCode: "2000", profile: P.s54,  stage: "lost", lostReason: "postponed" },
  { first: "Laurent",   last: "Girard",    day: "2026-06-24", canton: "VS", locality: "Sion",        postalCode: "1950", profile: P.s91,  stage: "won" },
  { first: "Manon",     last: "Henchoz",   day: "2026-06-27", canton: "VD", locality: "Vevey",       postalCode: "1800", profile: P.s80,  stage: "new", disqualified: "unreachable" },

  // ── Juillet ────────────────────────────────────────────────────────────
  { first: "Thierry",   last: "Isoz",      day: "2026-07-02", canton: "VD", locality: "Lausanne",    postalCode: "1004", profile: P.s100, stage: "won" },
  { first: "Céline",    last: "Jaquier",   day: "2026-07-07", canton: "GE", locality: "Meyrin",      postalCode: "1217", profile: P.s88,  stage: "lost", lostReason: "ghosted" },
  { first: "Fabien",    last: "Kohler",    day: "2026-07-11", canton: "VD", locality: "Renens",      postalCode: "1020", profile: P.s73,  stage: "quote_sent" },
  { first: "Nadia",     last: "Lambert",   day: "2026-07-15", canton: "FR", locality: "Fribourg",    postalCode: "1700", profile: P.s62,  stage: "appointment" },
  { first: "Grégoire",  last: "Monnier",   day: "2026-07-18", canton: "VD", locality: "Yverdon",     postalCode: "1400", profile: P.s100, stage: "won" },
  { first: "Sophie",    last: "Nicolet",   day: "2026-07-22", canton: "VS", locality: "Martigny",    postalCode: "1920", profile: P.s68,  stage: "contacted", disqualified: "long_timeframe" },
  { first: "Vincent",   last: "Oberson",   day: "2026-07-26", canton: "VD", locality: "Pully",       postalCode: "1009", profile: P.s93,  stage: "quote_sent" },
  { first: "Julie",     last: "Perrin",    day: "2026-07-30", canton: "GE", locality: "Vernier",     postalCode: "1214", profile: P.s80,  stage: "lost", lostReason: "not_interested" },

  // ── Août ───────────────────────────────────────────────────────────────
  { first: "Antoine",   last: "Quartier",  day: "2026-08-04", canton: "VD", locality: "Gland",       postalCode: "1196", profile: P.s88,  stage: "won" },
  { first: "Delphine",  last: "Rochat",    day: "2026-08-07", canton: "NE", locality: "La Chaux-de-Fonds", postalCode: "2300", profile: P.s73, stage: "appointment" },
  { first: "Marc",      last: "Savary",    day: "2026-08-11", canton: "VD", locality: "Échallens",   postalCode: "1040", profile: P.s100, stage: "quote_sent" },
  { first: "Estelle",   last: "Tissot",    day: "2026-08-14", canton: "FR", locality: "Romont",      postalCode: "1680", profile: P.s62,  stage: "contacted" },
  { first: "Raphaël",   last: "Uldry",     day: "2026-08-18", canton: "VD", locality: "Prilly",      postalCode: "1008", profile: P.s91,  stage: "appointment" },
  { first: "Aline",     last: "Vaucher",   day: "2026-08-21", canton: "GE", locality: "Onex",        postalCode: "1213", profile: P.s68,  stage: "appointment", disqualified: "no_authorization" },
  { first: "Damien",    last: "Wyss",      day: "2026-08-25", canton: "VS", locality: "Monthey",     postalCode: "1870", profile: P.s80,  stage: "contacted" },
  { first: "Florence",  last: "Zutter",    day: "2026-08-28", canton: "VD", locality: "Bussigny",    postalCode: "1030", profile: P.s100, stage: "won" },

  // ── Septembre : cohorte fraîche, encore ouverte ─────────────────────────
  { first: "Bastien",   last: "Amiguet",   day: "2026-09-01", canton: "VD", locality: "Crissier",    postalCode: "1023", profile: P.s88,  stage: "appointment" },
  { first: "Laure",     last: "Berset",    day: "2026-09-03", canton: "FR", locality: "Estavayer",   postalCode: "1470", profile: P.s73,  stage: "contacted" },
  { first: "Sébastien", last: "Clerc",     day: "2026-09-05", canton: "VD", locality: "Rolle",       postalCode: "1180", profile: P.s100, stage: "contacted" },
  { first: "Anouk",     last: "Ducret",    day: "2026-09-07", canton: "GE", locality: "Genève",      postalCode: "1201", profile: P.s62,  stage: "new" },
  { first: "Yann",      last: "Etter",     day: "2026-09-08", canton: "VD", locality: "Cossonay",    postalCode: "1304", profile: P.s93,  stage: "new" },
  { first: "Mélanie",   last: "Fasel",     day: "2026-09-09", canton: "NE", locality: "Boudry",      postalCode: "2017", profile: P.s88,  stage: "new" },
  { first: "Kevin",     last: "Gaillard",  day: "2026-09-10", canton: "VS", locality: "Sierre",      postalCode: "3960", profile: P.s80,  stage: "new" },
];

const APPLY = process.argv.includes("--apply");
const PURGE = process.argv.includes("--purge");

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function submissionData(s: Seed): Record<string, unknown> {
  return {
    ...s.profile,
    housingType: "house",
    homeBattery: "none",
    neighborhoodEquipment: "",
    electricalBoardType: "recent",
    parkingSpotLocation: "garage-attached",
    electricalLineDistance: 8,
    electricalLineHoleCount: 1,
    ecpStatus: "get-advice",
    ecpBrand: "",
    ecpModel: "",
    ecpProvided: "include",
    vehicleStatus: "own",
    vehicleBrand: "",
    vehicleModel: "",
    vehicleTripDistance: 40,
    vehicleChargingHours: 7,
    addressMode: "manual",
    address: "",
    country: "CH",
    comment: `[${SEED_TAG}] jeu de données de démonstration`,
    acceptTerms: true,
    streetName: "Route de Démonstration",
    streetNb: "1",
    postalCode: s.postalCode,
    locality: s.locality,
    canton: s.canton,
    product: "ecp",
  };
}

/**
 * The Kanban reads stage_history to place a won/lost card in the funnel column
 * it closed from; without it every closed lead lands under "Devis envoyé".
 */
function stageHistory(s: Seed, dispatchedAt: string): { stage: string; at: string }[] {
  const ORDER = ["new", "contacted", "appointment", "quote_sent"];
  const path =
    s.stage === "won" || s.stage === "lost"
      ? [...ORDER, s.stage]
      : ORDER.slice(0, ORDER.indexOf(s.stage) + 1);
  const base = new Date(dispatchedAt).getTime();
  return path.map((stage, i) => ({
    stage,
    at: new Date(base + i * 3 * 86_400_000).toISOString(),
  }));
}

async function purge() {
  const q = `?limit=200&fields=id&filter[email][_contains]=${EMAIL_DOMAIN}`;
  const users = await directusFetch<{ data: { id: string }[] }>(`/items/form_users${q}`, {
    next: { revalidate: 0 },
  });
  const ids = (users?.data ?? []).map((u) => u.id);
  console.log(`  ${ids.length} utilisateur(s) marqué(s) ${SEED_TAG}`);
  if (ids.length === 0) return;

  const subs = await directusFetch<{ data: { id: string; session: string | null }[] }>(
    `/items/form_submissions?limit=500&fields=id,session&filter[user][_in]=${ids.join(",")}`,
    { next: { revalidate: 0 } },
  );
  const subIds = (subs?.data ?? []).map((s) => s.id);
  const sessionIds = [...new Set((subs?.data ?? []).map((s) => s.session).filter(Boolean))] as string[];

  const disp = subIds.length
    ? await directusFetch<{ data: { id: string }[] }>(
        `/items/partner_dispatches?limit=500&fields=id&filter[submission][_in]=${subIds.join(",")}`,
        { next: { revalidate: 0 } },
      )
    : { data: [] };
  const dispIds = (disp?.data ?? []).map((d) => d.id);

  console.log(`  à supprimer: ${dispIds.length} dispatch, ${subIds.length} soumission(s), ${sessionIds.length} session(s), ${ids.length} utilisateur(s)`);
  if (!APPLY) return;

  // Children first — a dispatch holds the only FK to its submission.
  for (const [coll, list] of [
    ["partner_dispatches", dispIds],
    ["form_submissions", subIds],
    ["form_sessions", sessionIds],
    ["form_users", ids],
  ] as const) {
    for (const id of list) {
      try {
        await directusFetch(`/items/${coll}/${id}`, { method: "DELETE", next: { revalidate: 0 } });
      } catch (e) {
        console.log(`  ÉCHEC ${coll}/${id}: ${(e as Error).message}`);
      }
    }
    console.log(`  supprimé ${list.length} × ${coll}`);
  }
}

async function seed() {
  const weights = resolveWeights(null);
  const bands = resolveScoreBands(null);
  const tally: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
  const stages: Record<string, number> = {};

  for (const s of SEEDS) {
    const data = submissionData(s);
    const { score, band } = scoreLead(data, weights, bands);
    tally[band] += 1;
    const isDisq = Boolean(s.disqualified);
    const key = isDisq ? `disqualified:${s.stage}` : s.stage;
    stages[key] = (stages[key] ?? 0) + 1;

    const dispatchedAt = `${s.day}T09:15:00`;
    const history = stageHistory(s, dispatchedAt);
    const finalStage: DispatchStage = s.stage;

    if (!APPLY) {
      console.log(
        `  ${s.day}  ${(s.first + " " + s.last).padEnd(22)} ${String(key).padEnd(13)} score=${String(score).padStart(3)} ${band.padEnd(5)} ${s.lostReason ?? s.disqualified ?? ""}`,
      );
      continue;
    }

    const email = `${slug(s.first)}.${slug(s.last)}@${EMAIL_DOMAIN}`;
    const session = await directusFetch<{ data: { id: string } }>("/items/form_sessions", {
      method: "POST",
      body: JSON.stringify({
        session_token: `${SEED_TAG}-${slug(s.first)}-${slug(s.last)}`,
        form_type: "quote",
        locale: "fr-FR",
        user_agent: `${SEED_TAG}/1.0`,
        environment: ENVIRONMENT,
      }),
      next: { revalidate: 0 },
    });
    const user = await directusFetch<{ data: { id: string } }>("/items/form_users", {
      method: "POST",
      body: JSON.stringify({
        email,
        first_name: s.first,
        last_name: s.last,
        phone: "+41210000000",
        environment: ENVIRONMENT,
      }),
      next: { revalidate: 0 },
    });
    const submission = await directusFetch<{ data: { id: string } }>("/items/form_submissions", {
      method: "POST",
      body: JSON.stringify({
        session: session.data.id,
        user: user.data.id,
        form_type: "quote",
        status: "success",
        data,
        environment: ENVIRONMENT,
      }),
      next: { revalidate: 0 },
    });

    await directusFetch("/items/partner_dispatches", {
      method: "POST",
      body: JSON.stringify({
        partner: PARTNER_ID,
        submission: submission.data.id,
        canton: s.canton,
        mode_used: "exclusive",
        month_bucket: s.day.slice(0, 7),
        dispatched_at: dispatchedAt,
        status: "dispatched",
        environment: ENVIRONMENT,
        stage: finalStage,
        stage_entered_at: history[history.length - 1].at,
        stage_history: history,
        price_chf: PRICE_CHF,
        lead_category: deriveLeadCategory(data),
        product: "ecp",
        gift: false,
        // A worked lead is billed; a disqualified one never is.
        billable: !isDisq,
        billable_locked_at: isDisq ? null : history[history.length - 1].at,
        disqualified: isDisq,
        disqualification_reason: s.disqualified ?? null,
        disqualification_note: isDisq ? `[${SEED_TAG}] jeu de démonstration` : null,
        disqualified_at: isDisq ? history[history.length - 1].at : null,
        lost_reason: finalStage === "lost" ? s.lostReason : null,
        lost_note: finalStage === "lost" ? `[${SEED_TAG}] jeu de démonstration` : null,
        invoice: null,
      }),
      next: { revalidate: 0 },
    });
    console.log(`  créé  ${s.first} ${s.last} — ${key} (score ${score}, ${band})`);
  }

  console.log(`\n  bandes : ${JSON.stringify(tally)}`);
  console.log(`  étapes : ${JSON.stringify(stages)}`);
  console.log(`  total  : ${SEEDS.length} leads, CHF ${SEEDS.filter((s) => !s.disqualified).length * PRICE_CHF} facturables`);
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY RUN (ajouter --apply) ===");
  console.log(`    environnement: ${ENVIRONMENT}  partenaire: ${PARTNER_ID}\n`);

  const p = await directusFetch<{ data: { name: string; environment: string } }>(
    `/items/partners/${PARTNER_ID}?fields=name,environment`,
    { next: { revalidate: 0 } },
  );
  if (p?.data?.environment !== ENVIRONMENT) {
    throw new Error(
      `refus: le partenaire ${PARTNER_ID} est en "${p?.data?.environment}", pas "${ENVIRONMENT}"`,
    );
  }
  console.log(`    ${p.data.name} (${p.data.environment}) ✓\n`);

  if (PURGE) await purge();
  else await seed();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
