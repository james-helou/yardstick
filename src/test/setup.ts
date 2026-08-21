import { afterAll, beforeAll } from "vitest";
import { closeDb, closeDirectDb } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";

process.env.DATABASE_URL ??= "postgres://localhost:5432/yardstick_test";
Object.assign(process.env, { NODE_ENV: "test" });
process.env.BETTER_AUTH_SECRET ??= "test-secret-not-used-outside-the-test-suite-0001";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";

/**
 * The unit suite does not reach the network.
 *
 * A pillar handed no stub falls through to the real provider, and the test still passes
 * while quietly fetching somebody's website on every run. That is how `runner.test.ts`
 * spent two seconds on `https://brightsmile.ca` and then timed out on CI, which is
 * slower, with nothing in the failure naming the call as the cause.
 *
 * This does not make such a test fail, and it is not meant to: the runner degrades a
 * pillar rather than the scan, so a refused fetch is a failed pillar and the assertions
 * may not care. What it buys is that no test outcome and no test's duration depends on a
 * machine we do not own. Stub the provider anyway; this is the floor, not the fix.
 */
const offline: typeof fetch = (input) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return Promise.reject(
    new Error(
      `The unit suite tried to reach ${url}. Pass a stub for whatever provider needs it, ` +
        `the way the other tests in the file do.`,
    ),
  );
};

beforeAll(async () => {
  globalThis.fetch = offline;
  await migrate();
});

afterAll(async () => {
  await closeDb();
  await closeDirectDb();
});
