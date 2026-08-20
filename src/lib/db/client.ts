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

let directClient: postgres.Sql | null = null;

/**
 * A direct, unpooled connection with a single socket.
 *
 * Some managed Postgres poolers cannot run DDL reliably (Neon, for one, also rejects
 * `channel_binding`), so migrations and anything schema-level go through the unpooled
 * host when one is configured. Falls back to DATABASE_URL where there is no separate
 * pooler and the two are the same database, which is the case on Railway and locally.
 */
export function directDb(): postgres.Sql {
  if (directClient) return directClient;
  directClient = postgres(env().DATABASE_URL_UNPOOLED ?? env().DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 30,
    onnotice: () => {},
  });
  return directClient;
}

export async function closeDb(): Promise<void> {
  if (!client) return;
  const c = client;
  client = null;
  await c.end({ timeout: 5 });
}

export async function closeDirectDb(): Promise<void> {
  if (!directClient) return;
  const c = directClient;
  directClient = null;
  await c.end({ timeout: 5 });
}
