import { describe, expect, it } from "vitest";
import {
  ACTION_TOKEN_TTL_MS,
  actionBlocker,
  actionsFor,
  buildActionUrls,
  signDispatchAction,
  verifyDispatchAction,
} from "./action-token";

const KEY = "test-secret";
const NOW = Date.UTC(2026, 9, 18);

describe("dispatch action token", () => {
  it("round-trips a valid token", () => {
    const token = signDispatchAction({ d: "abc", a: "contacted", exp: NOW + 1000 }, KEY)!;
    expect(verifyDispatchAction(token, NOW, KEY)).toEqual({
      status: "valid",
      payload: { d: "abc", a: "contacted", exp: NOW + 1000 },
    });
  });

  it("reports an expired token with its payload", () => {
    const token = signDispatchAction({ d: "abc", a: "contacted", exp: NOW - 1 }, KEY)!;
    expect(verifyDispatchAction(token, NOW, KEY).status).toBe("expired");
  });

  it("rejects a token signed with another key", () => {
    const token = signDispatchAction({ d: "abc", a: "contacted", exp: NOW + 1000 }, "other")!;
    expect(verifyDispatchAction(token, NOW, KEY).status).toBe("invalid");
  });

  it("rejects a tampered payload", () => {
    const token = signDispatchAction({ d: "abc", a: "contacted", exp: NOW + 1000 }, KEY)!;
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ d: "abc", a: "disqualify", exp: NOW + 1000 })).toString("base64url");
    expect(verifyDispatchAction(`${forged}.${sig}`, NOW, KEY).status).toBe("invalid");
  });

  it("rejects garbage and an unknown action", () => {
    expect(verifyDispatchAction("nope", NOW, KEY).status).toBe("invalid");
    expect(verifyDispatchAction(undefined, NOW, KEY).status).toBe("invalid");
    const token = signDispatchAction({ d: "abc", a: "delete" as never, exp: NOW + 1000 }, KEY)!;
    expect(verifyDispatchAction(token, NOW, KEY).status).toBe("invalid");
  });

  it("issues nothing without a secret", () => {
    expect(signDispatchAction({ d: "abc", a: "contacted", exp: NOW }, null)).toBeNull();
    expect(buildActionUrls("abc", "new", "new", { key: null })).toBeNull();
  });
});

describe("actionsFor", () => {
  it("offers disqualify only on the new-lead e-mail", () => {
    expect(actionsFor("new", "new")).toEqual(["contacted", "disqualify"]);
    for (const stage of ["new", "contacted", "appointment", "quote_sent"] as const) {
      expect(actionsFor(stage, "reminder")).not.toContain("disqualify");
    }
  });

  it("offers nothing on a closed lead", () => {
    expect(actionsFor("won", "reminder")).toEqual([]);
    expect(actionsFor("lost", "reminder")).toEqual([]);
  });
});

describe("buildActionUrls", () => {
  it("builds one verifiable link per action, valid for the TTL", () => {
    const urls = buildActionUrls("abc", "new", "new", { siteUrl: "https://x.ch", now: NOW, key: KEY })!;
    expect(Object.keys(urls)).toEqual(["contacted", "disqualify"]);
    const token = urls.contacted!.replace("https://x.ch/partners/action/", "");
    const v = verifyDispatchAction(token, NOW, KEY);
    expect(v).toEqual({ status: "valid", payload: { d: "abc", a: "contacted", exp: NOW + ACTION_TOKEN_TTL_MS, c: "new" } });
  });
});

describe("actionBlocker", () => {
  const row = (stage: string, extra: Partial<{ disqualified: boolean | null; billable_locked_at: string | null }> = {}) => ({
    stage,
    disqualified: null,
    billable_locked_at: null,
    ...extra,
  });

  it("lets a forward move through", () => {
    expect(actionBlocker(row("new"), "contacted")).toBeNull();
    expect(actionBlocker(row("quote_sent"), "won")).toBeNull();
  });

  it("calls a repeat or overtaken move already done", () => {
    expect(actionBlocker(row("contacted"), "contacted")).toBe("already_done");
    expect(actionBlocker(row("appointment"), "contacted")).toBe("already_done");
    expect(actionBlocker(row("won"), "lost")).toBe("already_done");
  });

  it("stops everything on a disqualified lead", () => {
    expect(actionBlocker(row("new", { disqualified: true }), "contacted")).toBe("already_disqualified");
    expect(actionBlocker(row("new", { disqualified: true }), "disqualify")).toBe("already_disqualified");
  });

  it("refuses to disqualify once billing is locked, whatever the stage", () => {
    expect(actionBlocker(row("new"), "disqualify")).toBeNull();
    expect(actionBlocker(row("new", { billable_locked_at: "2026-10-01" }), "disqualify")).toBe("billing_locked");
  });
});
