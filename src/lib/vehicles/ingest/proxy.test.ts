import { describe, it, expect } from "vitest";
import { readProxyConfig, buildProxyUri } from "./proxy";

const full = {
  BRIGHTDATA_PROXY_HOST: "brd.superproxy.io:44445",
  BRIGHTDATA_CUSTOMER_ID: "hl_27b6d7ae",
  BRIGHTDATA_PROXY_ZONE: "datacenter_proxy1",
  BRIGHTDATA_PROXY_PASSWORD: "s3cret",
} as unknown as NodeJS.ProcessEnv;

describe("readProxyConfig", () => {
  it("reads a complete configuration", () => {
    expect(readProxyConfig(full)).toEqual({
      host: "brd.superproxy.io:44445",
      customerId: "hl_27b6d7ae",
      zone: "datacenter_proxy1",
      password: "s3cret",
    });
  });

  it("defaults the host, which is 44445 and NOT the 33335 in the public docs", () => {
    const { BRIGHTDATA_PROXY_HOST: _, ...rest } = full;
    expect(readProxyConfig(rest as NodeJS.ProcessEnv).host).toBe("brd.superproxy.io:44445");
  });

  // Fail-closed: each missing secret must throw, never degrade to a direct fetch.
  it.each(["BRIGHTDATA_PROXY_ZONE", "BRIGHTDATA_PROXY_PASSWORD", "BRIGHTDATA_CUSTOMER_ID"])(
    "throws when %s is missing rather than falling back to a direct download",
    (key) => {
      const env = { ...full };
      delete env[key];
      expect(() => readProxyConfig(env)).toThrow(new RegExp(key));
    },
  );

  it("names the privacy reason in the error, so the fix is obvious", () => {
    const env = { ...full };
    delete env.BRIGHTDATA_PROXY_ZONE;
    expect(() => readProxyConfig(env)).toThrow(/never downloads directly/i);
  });

  it("rejects an empty string as firmly as an absent value", () => {
    expect(() => readProxyConfig({ ...full, BRIGHTDATA_PROXY_PASSWORD: "" })).toThrow();
  });
});

describe("buildProxyUri", () => {
  it("builds the brd-customer-…-zone-… form", () => {
    expect(buildProxyUri(readProxyConfig(full))).toBe(
      "http://brd-customer-hl_27b6d7ae-zone-datacenter_proxy1:s3cret@brd.superproxy.io:44445",
    );
  });

  it("percent-encodes a password containing URI metacharacters", () => {
    const cfg = readProxyConfig({ ...full, BRIGHTDATA_PROXY_PASSWORD: "p@ss:w/rd" });
    expect(buildProxyUri(cfg)).toContain("p%40ss%3Aw%2Frd");
    expect(buildProxyUri(cfg)).toMatch(/@brd\.superproxy\.io:44445$/);
  });
});
