import { describe, expect, it } from "vitest";
import { signJwt, verifyJwt } from "./jwt";

const SECRET = "test-secret-0123456789abcdef";

describe("jwt", () => {
  it("round-trips claims", () => {
    const token = signJwt({ sub: "yoan@easyrecharge.ch", typ: "access" }, SECRET, 60);
    const claims = verifyJwt(token, SECRET);
    expect(claims?.sub).toBe("yoan@easyrecharge.ch");
    expect(claims?.typ).toBe("access");
    expect(typeof claims?.exp).toBe("number");
  });

  it("rejects a tampered payload", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "b", exp: 9999999999 })).toString("base64url");
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET)).toBeNull();
  });

  it("rejects the wrong secret", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    expect(verifyJwt(token, "other-secret-0123456789abcdef")).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signJwt({ sub: "a" }, SECRET, -10);
    expect(verifyJwt(token, SECRET)).toBeNull();
  });

  it("rejects garbage without throwing", () => {
    expect(verifyJwt("", SECRET)).toBeNull();
    expect(verifyJwt("a.b", SECRET)).toBeNull();
    expect(verifyJwt("a.b.c", SECRET)).toBeNull();
  });

  it("rejects alg=none header swaps", () => {
    const token = signJwt({ sub: "a" }, SECRET, 60);
    const [, p, s] = token.split(".");
    const noneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    expect(verifyJwt(`${noneHeader}.${p}.${s}`, SECRET)).toBeNull();
  });
});
