import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { directusFetch } from "@/lib/directus";
import { formatUid } from "@/lib/companies/ingest/normalize";
import { effectiveClassification } from "@/lib/companies/ingest/publish-rule";
import type { Classification } from "@/lib/companies/ingest/types";
import { err, run } from "./helpers";

const CLASSIFICATIONS = ["installer", "inspector", "planner", "solar", "other", "unclassified"] as const;
const PROSPECT_STATUSES = [
  "none", "to_contact", "contacted", "interested", "declined", "became_partner", "unqualified",
] as const;
const ENRICHMENT_STATUSES = ["pending", "done", "no_website", "failed"] as const;

/** What a sales conversation needs. Deliberately omits the raw purpose text, hashes and pipeline internals. */
const LIST_FIELDS = [
  "id", "ehraid", "status", "legal_name", "display_name", "legal_form_kind", "street_address",
  "postal_code", "locality", "canton", "uid", "register_url", "classification",
  "classification_override", "classification_confidence", "website", "phone", "email",
  "contact_person_name", "contact_person_role", "esti_permit_number", "esti_valid_until",
  "enrichment_status", "partner", "prospect_status", "last_contacted_at", "notes",
  "do_not_display", "in_liquidation",
] as const;

export interface CompanyFilterArgs {
  canton?: string;
  classification?: (typeof CLASSIFICATIONS)[number];
  prospect_status?: (typeof PROSPECT_STATUSES)[number];
  has_partner?: boolean;
  enrichment_status?: (typeof ENRICHMENT_STATUSES)[number];
  include_gone?: boolean;
  include_liquidation?: boolean;
}

type Clause = Record<string, unknown>;

/** Directus filter for list_companies. Classification filters the effective value: override first, then the model. */
export function buildCompanyFilter(a: CompanyFilterArgs): Clause {
  const and: Clause[] = [];
  if (!a.include_gone) and.push({ _or: [{ register_gone_at: { _null: true } }, { status: { _neq: "archived" } }] });
  if (!a.include_liquidation) and.push({ in_liquidation: { _eq: false } });
  if (a.canton) and.push({ canton: { _eq: a.canton.toUpperCase() } });
  if (a.classification) {
    and.push({
      _or: [
        { classification_override: { _eq: a.classification } },
        { _and: [{ classification_override: { _null: true } }, { classification: { _eq: a.classification } }] },
      ],
    });
  }
  if (a.prospect_status) and.push({ prospect_status: { _eq: a.prospect_status } });
  if (a.enrichment_status) and.push({ enrichment_status: { _eq: a.enrichment_status } });
  if (a.has_partner !== undefined) and.push({ partner: { _null: !a.has_partner } });
  return { _and: and };
}

/** Appends a dated line to the existing notes instead of replacing them. */
export function appendNote(existing: string | null | undefined, note: string, today: string): string {
  const line = `${today}: ${note.trim()}`;
  return existing && existing.trim() ? `${existing.trim()}\n${line}` : line;
}

type Row = Record<string, unknown>;

function present(r: Row) {
  return {
    ehraid: r.ehraid,
    name: r.display_name || r.legal_name,
    legalForm: r.legal_form_kind,
    address: [r.street_address, [r.postal_code, r.locality].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    canton: r.canton,
    uid: formatUid(r.uid as string | null),
    classification: effectiveClassification({
      classification: (r.classification as Classification | null) ?? null,
      classification_override: (r.classification_override as Classification | null) ?? null,
    }),
    classificationConfidence: r.classification_confidence === null ? null : Number(r.classification_confidence),
    status: r.status,
    isPartner: !!r.partner,
    contact: {
      website: r.website ?? null,
      phone: r.phone ?? null,
      email: r.email ?? null,
      person: [r.contact_person_name, r.contact_person_role].filter(Boolean).join(", ") || null,
    },
    estiPermit: r.esti_permit_number ? { number: r.esti_permit_number, validUntil: r.esti_valid_until ?? null } : null,
    enrichmentStatus: r.enrichment_status,
    prospectStatus: r.prospect_status,
    lastContactedAt: r.last_contacted_at ?? null,
    notes: r.notes ?? null,
    registerUrl: r.register_url,
  };
}

export async function listCompanies(
  args: CompanyFilterArgs & { limit?: number; offset?: number },
  fetcher: typeof directusFetch = directusFetch,
) {
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;
  const qs = new URLSearchParams({
    fields: LIST_FIELDS.join(","),
    filter: JSON.stringify(buildCompanyFilter(args)),
    sort: "canton,legal_name",
    limit: String(limit),
    offset: String(offset),
    meta: "filter_count",
  });
  const res = await fetcher<{ data: Row[]; meta?: { filter_count?: number } }>(`/items/companies?${qs}`, {
    next: { revalidate: 0 },
  });
  return { total: res.meta?.filter_count ?? res.data.length, offset, count: res.data.length, companies: res.data.map(present) };
}

export interface ProspectUpdate {
  ehraid: string;
  prospect_status?: (typeof PROSPECT_STATUSES)[number];
  last_contacted_at?: string;
  note?: string;
}

/** Writes only the three prospect fields. Nothing else on a company can be changed from here. */
export async function updateCompanyProspect(
  u: ProspectUpdate,
  opts: { fetcher?: typeof directusFetch; today?: string } = {},
) {
  const fetcher = opts.fetcher ?? directusFetch;
  const found = await fetcher<{ data: Row[] }>(
    `/items/companies?filter[ehraid][_eq]=${encodeURIComponent(u.ehraid)}&fields=id,notes,legal_name&limit=1`,
    { next: { revalidate: 0 } },
  );
  const row = found.data[0];
  if (!row) throw new Error(`No company with ehraid ${u.ehraid}`);

  const patch: Row = {};
  if (u.prospect_status) patch.prospect_status = u.prospect_status;
  if (u.last_contacted_at) patch.last_contacted_at = u.last_contacted_at;
  if (u.note) patch.notes = appendNote(row.notes as string | null, u.note, opts.today ?? new Date().toISOString().slice(0, 10));
  if (Object.keys(patch).length === 0) throw new Error("Nothing to update: pass prospect_status, last_contacted_at or note.");

  await fetcher(`/items/companies/${row.id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
    retry: false,
    next: { revalidate: 0 },
  });
  return { ehraid: u.ehraid, name: row.legal_name, updated: Object.keys(patch) };
}

export function registerCompanyTools(server: McpServer) {
  server.registerTool(
    "list_companies",
    {
      title: "List register companies",
      description:
        "Swiss electrical installers from the commercial register (Zefix), with classification, contact details when found, and prospect status. " +
        "Use it to build a sales list for cantons without a partner. classification filters the effective value (a human override beats the model). " +
        "Rows struck off the register and companies in liquidation are hidden unless asked for. Contains personal data for sole proprietorships: do not paste it into other tools.",
      inputSchema: {
        canton: z.string().length(2).optional().describe("Two-letter canton code, e.g. ZH"),
        classification: z.enum(CLASSIFICATIONS).optional(),
        prospect_status: z.enum(PROSPECT_STATUSES).optional(),
        has_partner: z.boolean().optional().describe("true = already an easyRecharge partner, false = not yet"),
        enrichment_status: z.enum(ENRICHMENT_STATUSES).optional(),
        include_gone: z.boolean().default(false),
        include_liquidation: z.boolean().default(false),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => run(() => listCompanies(args)),
  );

  server.registerTool(
    "update_company_prospect",
    {
      title: "Update a company's prospect status",
      description:
        "Sets the sales follow-up on one company by ehraid: prospect_status, last_contacted_at (YYYY-MM-DD) and/or a note appended with today's date. " +
        "Cannot change anything else on the company.",
      inputSchema: {
        ehraid: z.string().min(1),
        prospect_status: z.enum(PROSPECT_STATUSES).optional(),
        last_contacted_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        note: z.string().min(1).max(1000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async (args) => {
      try {
        return await run(() => updateCompanyProspect(args));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
