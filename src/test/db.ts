import { db } from "@/lib/db/client";

/** Truncate every table except the migration ledger. Call in beforeEach for tests that write. */
export async function resetTables(): Promise<void> {
  const rows = await db()<{ tablename: string }[]>`
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'schema_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `public."${r.tablename}"`).join(", ");
  await db().unsafe(`truncate ${list} restart identity cascade`);
}
