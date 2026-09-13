import { ProxyAgent, type Dispatcher } from "undici";

/**
 * Bright Data's own zone email gives 44445. The public documentation says
 * 33335, which does not work for this account. Do not "correct" this back.
 */
const DEFAULT_HOST = "brd.superproxy.io:44445";

export interface ProxyConfig {
  host: string;
  customerId: string;
  zone: string;
  password: string;
}

/**
 * Reads the proxy configuration, or throws.
 *
 * Throwing is the point. Every vehicle image is fetched from EV Database, and
 * doing that from the operator's own address is exactly what this feature
 * exists to avoid. A missing zone must stop the run, never quietly downgrade
 * it to a direct download.
 */
export function readProxyConfig(env: NodeJS.ProcessEnv): ProxyConfig {
  const required = {
    BRIGHTDATA_CUSTOMER_ID: env.BRIGHTDATA_CUSTOMER_ID,
    BRIGHTDATA_PROXY_ZONE: env.BRIGHTDATA_PROXY_ZONE,
    BRIGHTDATA_PROXY_PASSWORD: env.BRIGHTDATA_PROXY_PASSWORD,
  };

  const missing = Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    throw new Error(
      `Bright Data proxy is not configured: ${missing.join(", ")} missing. ` +
        `This command never downloads directly — every image is fetched through ` +
        `the proxy zone so the operator's IP is not exposed. Set the variables ` +
        `in .env.local and retry.`,
    );
  }

  return {
    host: env.BRIGHTDATA_PROXY_HOST || DEFAULT_HOST,
    customerId: required.BRIGHTDATA_CUSTOMER_ID as string,
    zone: required.BRIGHTDATA_PROXY_ZONE as string,
    password: required.BRIGHTDATA_PROXY_PASSWORD as string,
  };
}

export function buildProxyUri(cfg: ProxyConfig): string {
  const user = `brd-customer-${cfg.customerId}-zone-${cfg.zone}`;
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(cfg.password)}@${cfg.host}`;
}

/**
 * `rejectUnauthorized: false` mirrors the `-k` that Bright Data's own sample
 * curl uses: the super-proxy terminates TLS with its own certificate.
 */
export function createDispatcher(cfg: ProxyConfig): Dispatcher {
  return new ProxyAgent({
    uri: buildProxyUri(cfg),
    requestTls: { rejectUnauthorized: false },
  });
}
