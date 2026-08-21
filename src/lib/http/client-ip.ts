import { createHash } from "node:crypto";
import { env } from "@/lib/env";

/** The submitter's address as the proxy saw it. Railway sets x-forwarded-for. */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip");
}

/**
 * A salted hash, never the address itself. It is enough to tell one submitter from
 * another for an hour, and useless as a record of who visited: without the salt it
 * cannot be reversed, and the salt is the app's own secret.
 */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = env().BETTER_AUTH_SECRET ?? "yardstick-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}
