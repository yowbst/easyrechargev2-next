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
  missing_invoice_code: 500,
};

export function errorStatus(e: unknown): number {
  return e instanceof Error ? (STATUS_BY_ERROR[e.message] ?? 500) : 500;
}
