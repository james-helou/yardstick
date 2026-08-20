/**
 * Regenerates the better-auth portion of the schema from the *installed* library,
 * so an upgrade can never silently leave the committed migration behind.
 *
 *   createdb yardstick_authgen
 *   AUTH_SCHEMA_DATABASE_URL=postgres://localhost:5432/yardstick_authgen \
 *     npm run auth:schema > /tmp/auth.sql
 *   dropdb yardstick_authgen
 *
 * Compare the output against migrations/0004_auth.sql. Any difference means a new,
 * additive migration is due — never edit a committed one.
 */
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { authOptions } from "../src/lib/auth/server";

async function main() {
  const url = process.env.AUTH_SCHEMA_DATABASE_URL;
  if (!url) throw new Error("AUTH_SCHEMA_DATABASE_URL must point at an empty scratch database");

  const pool = new Pool({ connectionString: url, max: 1 });
  const { compileMigrations } = await getMigrations(authOptions(pool));
  process.stdout.write(await compileMigrations());
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
