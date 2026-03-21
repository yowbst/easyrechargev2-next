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

export function getAttributionCompact(): Record<string, unknown> {
  const full = getAttribution();
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(full)) {
    if (v != null) result[k] = v;
  }
  return Object.keys(result).length > 0 ? result : {};
}
