import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { directDb } from "./client";

const MIGRATIONS_DIR = path.join(process.cwd(), "migrations");

/** Arbitrary but fixed: two processes migrating at once must serialise on this. */
const LOCK_KEY = 4_017_231_101;

async function ensureLedger(): Promise<void> {
  await directDb()`
    create table if not exists schema_migrations (
      name        text primary key,
      applied_at  timestamptz not null default now()
    )
  `;
}

export async function appliedMigrations(): Promise<string[]> {
  await ensureLedger();
  const rows = await directDb()<{ name: string }[]>`
    select name from schema_migrations order by name
  `;
  return rows.map((r) => r.name);
}

/** Applies every unapplied migration in filename order. Returns what it ran. */
export async function migrate(): Promise<string[]> {
  await ensureLedger();
  const sql = directDb();
  await sql`select pg_advisory_lock(${LOCK_KEY})`;
  try {
    const done = new Set(await appliedMigrations());
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    const ran: string[] = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const body = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into schema_migrations (name) values (${file})`;
      });
      ran.push(file);
    }
    return ran;
  } finally {
    await sql`select pg_advisory_unlock(${LOCK_KEY})`;
  }
}
