import { describe, expect, it } from "vitest";
import { describeSdkError, withPaymentRetry } from "./client";

describe("describeSdkError", () => {
  it("treats 402 Payment Required as fatal and surfaces the vendor message", () => {
    const e = { message: "An unexpected server error occurred.", status: 402, response: '{"status_code":40200,"status_message":"Payment Required."}' };
    expect(describeSdkError(e)).toEqual({ message: "HTTP 402: Payment Required.", fatal: true });
  });

  it.each([401, 403])("treats %i as fatal", (status) => {
    expect(describeSdkError({ status, response: "nope" }).fatal).toBe(true);
  });

  it("does not stop the run for a server error or a timeout", () => {
    expect(describeSdkError({ status: 500, response: "oops" })).toEqual({ message: "HTTP 500: oops", fatal: false });
    expect(describeSdkError(new Error("timed out"))).toEqual({ message: "timed out", fatal: false });
  });

  it("keeps non-JSON bodies, truncated", () => {
    expect(describeSdkError({ status: 502, response: "x".repeat(500) }).message).toHaveLength("HTTP 502: ".length + 300);
  });
});

describe("withPaymentRetry", () => {
  const noSleep = async () => {};

  it("retries a spurious 402 and returns the eventual result", async () => {
    let n = 0;
    const r = await withPaymentRetry(async () => {
      if (++n < 3) throw { status: 402 };
      return "ok";
    }, { sleep: noSleep });
    expect(r).toBe("ok");
    expect(n).toBe(3);
  });

  it("gives up after the last attempt so a real empty account still stops the run", async () => {
    let n = 0;
    await expect(
      withPaymentRetry(async () => {
        n++;
        throw { status: 402 };
      }, { attempts: 3, sleep: noSleep }),
    ).rejects.toMatchObject({ status: 402 });
    expect(n).toBe(3);
  });

  it("does not retry anything else", async () => {
    let n = 0;
    await expect(withPaymentRetry(async () => { n++; throw { status: 500 }; }, { sleep: noSleep })).rejects.toBeDefined();
    expect(n).toBe(1);
  });

  it("backs off longer each time", async () => {
    const waits: number[] = [];
    let n = 0;
    await withPaymentRetry(async () => { if (++n < 4) throw { status: 402 }; }, { delayMs: 100, sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([100, 200, 300]);
  });
});
