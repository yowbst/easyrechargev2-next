function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export interface Attribution {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  dclid: string | null;
  fbc: string | null;
  fbp: string | null;
  msclkid: string | null;
  ttclid: string | null;
  li_fat_id: string | null;
  twclid: string | null;
  sccid: string | null;
  epik: string | null;
  rdt_cid: string | null;
  landingPage: string | null;
  utm: Record<string, string> | null;
}

export function getAttribution(): Attribution {
  let utm: Record<string, string> | null = null;
  try {
    const raw = getCookie("_utm");
    if (raw) utm = JSON.parse(raw);
  } catch { /* ignore */ }

  return {
    gclid: getCookie("_gcl_aw"),
    gbraid: getCookie("_gcl_gb"),
    wbraid: getCookie("_gcl_wb"),
    dclid: getCookie("_dclid"),
    fbc: getCookie("_fbc"),
    fbp: getCookie("_fbp"),
    msclkid: getCookie("_msclkid"),
    ttclid: getCookie("_ttclid"),
    li_fat_id: getCookie("_li_fat_id"),
    twclid: getCookie("_twclid"),
    sccid: getCookie("_sccid"),
    epik: getCookie("_epik"),
    rdt_cid: getCookie("_rdt_cid"),
    landingPage: getCookie("_landing_page"),
    utm,
  };
}

/**
 * Infer utm_source and utm_medium from ad click IDs when UTM params
 * are not explicitly set. This ensures attribution is correct even
 * when the landing page URL only contains a click ID (e.g. ?gclid=...).
 */
function inferUtmFromClickIds(attr: Attribution): Record<string, string> | null {
  const utm = attr.utm ? { ...attr.utm } : {};

  // Only infer if utm_source is not already set
  if (utm.utm_source) return Object.keys(utm).length > 0 ? utm : null;

  if (attr.gclid || attr.gbraid || attr.wbraid) {
    utm.utm_source = utm.utm_source || "google";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.dclid) {
    utm.utm_source = utm.utm_source || "google";
    utm.utm_medium = utm.utm_medium || "display";
  } else if (attr.fbc || attr.fbp) {
    utm.utm_source = utm.utm_source || "facebook";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.msclkid) {
    utm.utm_source = utm.utm_source || "bing";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.ttclid) {
    utm.utm_source = utm.utm_source || "tiktok";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.li_fat_id) {
    utm.utm_source = utm.utm_source || "linkedin";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.twclid) {
    utm.utm_source = utm.utm_source || "twitter";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.sccid) {
    utm.utm_source = utm.utm_source || "snapchat";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.epik) {
    utm.utm_source = utm.utm_source || "pinterest";
    utm.utm_medium = utm.utm_medium || "cpc";
  } else if (attr.rdt_cid) {
    utm.utm_source = utm.utm_source || "reddit";
    utm.utm_medium = utm.utm_medium || "cpc";
  }

  return Object.keys(utm).length > 0 ? utm : null;
}

export function getAttributionCompact(): Record<string, unknown> {
  const full = getAttribution();
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) {
    if (v != null) result[k] = v;
  }

  // Enrich UTM from click IDs
  const enrichedUtm = inferUtmFromClickIds(full);
  if (enrichedUtm) result.utm = enrichedUtm;

  return Object.keys(result).length > 0 ? result : {};
}
