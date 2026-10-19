import { directusFetch } from "@/lib/directus";

/**
 * `site_settings.global_config` for server-side writes: quote and contact
 * submissions, dispatch, reminders, lifecycle events, invoicing. One read,
 * one policy:
 *
 * - **Uncached.** A change in Directus applies on the next request. A cached
 *   copy outlives deploys in Vercel's data cache, and once already dropped
 *   every lifecycle event because it predated `webhooks.dispatch_events`.
 *   These paths run a few times a day, so the cost is nothing.
 * - **No status filter.** `site_settings` is a singleton; unpublishing it must
 *   not silently stop lead delivery.
 *
 * Each section is parsed, with its defaults, where it is used
 * (`fetchDispatchConfig`, `fetchReminderConfig`, `fetchCompany`). The page
 * layout (`fetchLayout`) reads its own projection with ISR and is not this.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GlobalConfig = Record<string, any>;

export async function getGlobalConfig(): Promise<GlobalConfig> {
  try {
    const res = await directusFetch<{ data: { global_config?: GlobalConfig } | { global_config?: GlobalConfig }[] | null }>(
      "/items/site_settings?fields=global_config",
      { next: { revalidate: 0 } },
    );
    const raw = res?.data;
    const record = Array.isArray(raw) ? raw[0] : raw;
    return record?.global_config ?? {};
  } catch {
    return {};
  }
}

export type WebhookName = "quote" | "contact" | "dispatch_events";

/** `global_config.webhooks.<name>`, or null when not configured. */
export async function webhookUrl(name: WebhookName): Promise<string | null> {
  const url = (await getGlobalConfig()).webhooks?.[name];
  return typeof url === "string" && url ? url : null;
}
