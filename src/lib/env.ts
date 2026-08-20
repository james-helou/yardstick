import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_UNPOOLED: z.string().min(1).optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
