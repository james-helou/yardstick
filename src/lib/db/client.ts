import postgres from "postgres";
import { env } from "@/lib/env";

let client: postgres.Sql | null = null;

/**
 * Lazy singleton. NUMERIC comes back as a string and timestamptz as a Date;
 * both are coerced at the repository boundary, never trusted further in.
 */
export function db(): postgres.Sql {
  if (client) return client;
  client = postgres(env().DATABASE_URL, {
    max: env().NODE_ENV === "test" ? 4 : 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  return client;
}

export async function closeDb(): Promise<void> {
  if (!client) return;
  const c = client;
  client = null;
  await c.end({ timeout: 5 });
}
