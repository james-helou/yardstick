import { betterAuth } from "better-auth";
import { Pool } from "pg";
import { env } from "@/lib/env";

let pool: Pool | null = null;

/**
 * better-auth speaks node-postgres, while the rest of the app uses `postgres`.
 * Two small pools is a smaller price than bending either library.
 */
function authPool(): Pool {
  if (pool) return pool;
  pool = new Pool({ connectionString: env().DATABASE_URL, max: 5 });
  return pool;
}

/**
 * The single source of truth for auth configuration. `scripts/generate-auth-schema.ts`
 * reads the same object, so the committed migration cannot drift from the running config.
 */
export function authOptions(database: Pool = authPool()) {
  const e = env();
  if (e.NODE_ENV === "production" && !e.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required in production");
  }

  return {
    database,
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.BETTER_AUTH_URL,
    // Our own tables key on uuid; keep identity ids the same shape.
    advanced: { database: { generateId: "uuid" as const } },
    emailAndPassword: { enabled: true },
    socialProviders:
      e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET
        ? { google: { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } }
        : {},
  };
}

function createAuth() {
  return betterAuth(authOptions());
}

export type AuthInstance = ReturnType<typeof createAuth>;

let instance: AuthInstance | null = null;

/** Lazy, so a missing secret cannot throw at import time and break `next build`. */
export function auth(): AuthInstance {
  instance ??= createAuth();
  return instance;
}

/** Google is wired but dormant until both credentials are set. */
export function isGoogleSignInEnabled(): boolean {
  const e = env();
  return Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET);
}

/** Test seam: drops the cached instance so a new env can take effect. */
export function resetAuthInstance(): void {
  instance = null;
}
