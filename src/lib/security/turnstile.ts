import { callExternal } from "@/lib/external/call";
import { env } from "@/lib/env";

const ENDPOINT = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const PROVIDER = "turnstile";

export type BotCheck = {
  /** False only when a configured check actually rejected the submission. */
  ok: boolean;
  /** Why it failed, in words a form can show. */
  reason?: string;
};

/**
 * The bot check for public forms. Dormant until both halves of the credential exist,
 * because a half-configured check is worse than none: it would reject every real
 * submission while the agency wonders where their leads went.
 */
export function turnstileConfigured(): boolean {
  const { TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY } = env();
  return Boolean(TURNSTILE_SITE_KEY && TURNSTILE_SECRET_KEY);
}

export function turnstileSiteKey(): string | null {
  return env().TURNSTILE_SITE_KEY ?? null;
}

export async function verifyTurnstile(
  token: string | null | undefined,
  options?: { remoteIp?: string | null; fetchImpl?: typeof fetch },
): Promise<BotCheck> {
  const secret = env().TURNSTILE_SECRET_KEY;
  // Not configured is not a failure. Nothing to check against, so nothing to reject.
  if (!secret || !env().TURNSTILE_SITE_KEY) return { ok: true };

  if (!token) return { ok: false, reason: "Complete the check below and try again" };

  const doFetch = options?.fetchImpl ?? fetch;
  const body = new URLSearchParams({ secret, response: token });
  if (options?.remoteIp) body.set("remoteip", options.remoteIp);

  try {
    const result = await callExternal(
      async (signal) => {
        const response = await doFetch(ENDPOINT, { method: "POST", body, signal });
        return (await response.json()) as { success?: boolean; "error-codes"?: string[] };
      },
      { name: PROVIDER, timeoutMs: 5_000, retries: 1 },
    );
    return result.success ? { ok: true } : { ok: false, reason: "That check did not pass. Please try again." };
  } catch {
    // Cloudflare being down must not take the agency's lead form down with it. The rate
    // limit still applies, so the failure mode is a slower door, not an open one.
    return { ok: true };
  }
}
