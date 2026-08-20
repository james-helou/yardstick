import { closeDirectDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";

/**
 * Brings the end-to-end database up to date before the server starts. Without this the
 * suite silently depends on someone having run the migrations by hand, and a new
 * migration shows up as a mystery failure in an unrelated test.
 */
export default async function globalSetup(): Promise<void> {
  const applied = await migrate();
  if (applied.length > 0) console.log(`[e2e] applied ${applied.length} migration(s)`);
  await closeDirectDb();
}
