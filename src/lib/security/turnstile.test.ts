import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { resetBreakers } from "@/lib/external/call";
import { turnstileConfigured, turnstileSiteKey, verifyTurnstile } from "./turnstile";

const ORIGINAL = { ...process.env };

function configure(site?: string, secret?: string) {
  if (site) process.env.TURNSTILE_SITE_KEY = site;
  else delete process.env.TURNSTILE_SITE_KEY;
  if (secret) process.env.TURNSTILE_SECRET_KEY = secret;
  else delete process.env.TURNSTILE_SECRET_KEY;
  resetEnvCache();
}

beforeEach(() => resetBreakers());

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetEnvCache();
});

const verdict = (success: boolean) => new Response(JSON.stringify({ success }), { status: 200 });

describe("turnstile", () => {
  it("stays dormant, and passes everything, until both halves exist", async () => {
    configure("site-key", undefined);
    expect(turnstileConfigured()).toBe(false);

    const fetchImpl = vi.fn<typeof fetch>();
    expect(await verifyTurnstile(null, { fetchImpl })).toEqual({ ok: true });
    // A half-configured check would reject every real submission.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports its site key only when it is actually on", () => {
    configure(undefined, undefined);
    expect(turnstileSiteKey()).toBeNull();

    configure("site-key", "secret-key");
    expect(turnstileConfigured()).toBe(true);
    expect(turnstileSiteKey()).toBe("site-key");
  });

  it("rejects a submission with no token once it is configured", async () => {
    configure("site-key", "secret-key");
    const fetchImpl = vi.fn<typeof fetch>();

    const result = await verifyTurnstile(null, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/check/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the secret in the body, never in the URL", async () => {
    configure("site-key", "secret-key");
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => verdict(true));

    expect(await verifyTurnstile("a-token", { remoteIp: "203.0.113.4", fetchImpl })).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).not.toContain("secret-key");
    const body = init?.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret-key");
    expect(body.get("response")).toBe("a-token");
    expect(body.get("remoteip")).toBe("203.0.113.4");
  });

  it("fails a token Cloudflare rejects", async () => {
    configure("site-key", "secret-key");
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => verdict(false));

    const result = await verifyTurnstile("a-token", { fetchImpl });
    expect(result.ok).toBe(false);
  });

  it("lets a submission through when Cloudflare itself is unreachable", async () => {
    configure("site-key", "secret-key");
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));

    // The rate limit still applies, so the failure mode is a slower door, not an open one.
    expect(await verifyTurnstile("a-token", { fetchImpl })).toEqual({ ok: true });
  });
});
