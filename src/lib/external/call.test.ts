import { beforeEach, describe, expect, it, vi } from "vitest";
import { CircuitOpenError, ExternalTimeoutError, callExternal, resetBreakers } from "./call";

const noSleep = async () => {};

beforeEach(() => resetBreakers());

describe("callExternal", () => {
  it("returns the value on success", async () => {
    expect(await callExternal(async () => 42, { name: "ok", sleep: noSleep })).toBe(42);
  });

  it("times out a hanging call", async () => {
    await expect(
      callExternal(() => new Promise(() => {}), {
        name: "hang",
        timeoutMs: 10,
        retries: 0,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(ExternalTimeoutError);
  });

  it("aborts the signal it handed the caller when it times out", async () => {
    let seen: AbortSignal | undefined;
    await expect(
      callExternal(
        (signal) => {
          seen = signal;
          return new Promise(() => {});
        },
        { name: "abort", timeoutMs: 10, retries: 0, sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(ExternalTimeoutError);
    expect(seen?.aborted).toBe(true);
  });

  it("retries a failing call up to the limit then throws", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(callExternal(fn, { name: "flaky", retries: 2, sleep: noSleep })).rejects.toThrow(
      /boom/,
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops retrying once it succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("once")).mockResolvedValue("good");
    await expect(callExternal(fn, { name: "recovers", retries: 3, sleep: noSleep })).resolves.toBe(
      "good",
    );
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the error is classified unretryable", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("bad request"));
    await expect(
      callExternal(fn, { name: "fatal", retries: 3, isRetryable: () => false, sleep: noSleep }),
    ).rejects.toThrow(/bad request/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backs off with growing delays", async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(
      callExternal(fn, {
        name: "backoff",
        retries: 3,
        baseDelayMs: 100,
        jitter: false,
        sleep: async (ms) => {
          delays.push(ms);
        },
      }),
    ).rejects.toThrow();
    expect(delays).toEqual([100, 200, 400]);
  });

  it("opens the circuit after repeated failures and fails fast", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    for (let i = 0; i < 5; i++) {
      await expect(
        callExternal(fn, { name: "provider", retries: 0, sleep: noSleep }),
      ).rejects.toThrow();
    }
    const calls = fn.mock.calls.length;
    await expect(
      callExternal(fn, { name: "provider", retries: 0, sleep: noSleep }),
    ).rejects.toBeInstanceOf(CircuitOpenError);
    expect(fn.mock.calls.length).toBe(calls);
  });

  it("half-opens once the cooldown elapses", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("down"));
    for (let i = 0; i < 5; i++) {
      await expect(
        callExternal(fn, { name: "cool", retries: 0, sleep: noSleep }),
      ).rejects.toThrow();
    }
    await expect(
      callExternal(async () => "recovered", {
        name: "cool",
        retries: 0,
        sleep: noSleep,
        now: () => Date.now() + 60_000,
      }),
    ).resolves.toBe("recovered");
  });

  it("keeps breakers separate per provider name", async () => {
    const bad = vi.fn().mockRejectedValue(new Error("down"));
    for (let i = 0; i < 5; i++) {
      await expect(callExternal(bad, { name: "a", retries: 0, sleep: noSleep })).rejects.toThrow();
    }
    await expect(callExternal(async () => "fine", { name: "b", sleep: noSleep })).resolves.toBe(
      "fine",
    );
  });

  it("resets the failure count after a success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x"))
      .mockRejectedValueOnce(new Error("x"))
      .mockResolvedValueOnce("ok")
      .mockRejectedValue(new Error("x"));
    for (let i = 0; i < 4; i++) {
      await expect(callExternal(fn, { name: "reset", retries: 0, sleep: noSleep })).rejects.toThrow();
    }
    await expect(callExternal(fn, { name: "reset", retries: 0, sleep: noSleep })).resolves.toBe("ok");
    await expect(callExternal(fn, { name: "reset", retries: 0, sleep: noSleep })).rejects.toThrow(
      /x/,
    );
  });
});
