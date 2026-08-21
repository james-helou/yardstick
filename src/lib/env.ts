import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Signing secret for sessions. Required in production, generated in dev if absent. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),

  /** Google sign-in stays dormant until both halves are present. */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  /** Places import stays dormant without a key, since every call is billed. */
  GOOGLE_PLACES_API_KEY: z.string().min(1).optional(),

  /** AI visibility. Dormant without a key, since every probe is a paid completion. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Which assistant we are measuring. Stamped on every stored probe. */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-5"),

  /** Bot check for public forms. Both halves or the check stays dormant. */
  TURNSTILE_SITE_KEY: z.string().min(1).optional(),
  TURNSTILE_SECRET_KEY: z.string().min(1).optional(),

  /** Rank data. Both halves or nothing: the grid pillar reports itself unmeasured. */
  DATAFORSEO_LOGIN: z.string().min(1).optional(),
  DATAFORSEO_PASSWORD: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Read once, validate once. Never called at import time so a missing var cannot break `next build`. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment — ${detail}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
