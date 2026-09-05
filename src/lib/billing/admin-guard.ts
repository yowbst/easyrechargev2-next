/** Same convention as /api/admin/billing — a static header, no session. */
export function assertAdmin(req: Request): boolean {
  const token = process.env.DIRECTUS_STATIC_TOKEN;
  return Boolean(token) && req.headers.get("x-admin-token") === token;
}

const STATUS_BY_ERROR: Record<string, number> = {
  invalid_month: 400,
  partner_not_found: 404,
  invoice_not_found: 404,
  period_not_issuable: 409,
  unsettled_dispatches: 409,
  empty_scope: 409,
  duplicate_number: 409,
  invalid_transition: 409,
  invoice_closed: 409,
  // The invoice's lead lines carry more than one unit price, so the Doc's single
  // aggregated line cannot represent them. A state problem, not a server fault.
  mixed_unit_prices: 409,
  invoice_folder_not_found: 409,
  invalid_amount: 400,
  missing_invoice_code: 500,
  invoice_create_failed: 500,
  scope_limit_exceeded: 500,
};

function isKnownDomainError(e: unknown): e is Error {
  return e instanceof Error && Object.prototype.hasOwnProperty.call(STATUS_BY_ERROR, e.message);
}

export function errorStatus(e: unknown): number {
  return isKnownDomainError(e) ? STATUS_BY_ERROR[e.message] : 500;
}

/**
 * The message sent back to the caller (HTTP or MCP). Known domain errors are
 * the contract with callers — their message IS the API, so it's returned
 * verbatim. Anything else (a raw Directus error, a Google API failure, a
 * network error, ...) may carry internal details — collection/field names,
 * stack traces — that must never reach an external caller, so it's logged
 * server-side and collapsed to a generic message instead.
 */
export function errorBody(e: unknown): { error: string } {
  if (isKnownDomainError(e)) return { error: e.message };
  console.error("[admin/invoices]", e);
  return { error: "internal_error" };
}
