/**
 * Live scan round-trip. Creates one throwaway org and one throwaway business pointed at
 * a site that is safe to fetch, starts a real scan, waits for the worker to run every
 * pillar, prints what each one said, then deletes everything it created.
 *
 * This is the only honest proof that the pipeline works in production: the queue, the
 * worker's handler registration, the analysers and the finalisation, against the real
 * database rather than a mock.
 */
import { closeDb, db } from "../src/lib/db/client";
import { creditBalance, grantCredits } from "../src/lib/db/repos/credits";
import { latestPillarResults } from "../src/lib/db/repos/scans";
import { startScan } from "../src/lib/scans/runner";

const TARGET = process.env.SCAN_SMOKE_URL ?? "https://example.com";
const TIMEOUT_MS = 90_000;

async function main() {
  const sql = db();
  const [org] = await sql<{ id: string }[]>`
    insert into orgs (name, slug) values ('scan smoke', ${`scan-smoke-${process.pid}`})
    returning id`;
  const scope = { orgId: org.id };

  try {
    // Granted so the paid pillar reaches its provider check. Without this the ledger
    // refuses it first and the run says nothing about whether rank data is configured.
    await grantCredits(scope, { amount: 5, reason: "Smoke grant" });

    const [business] = await sql<{ id: string }[]>`
      insert into businesses (org_id, name, website_url)
      values (${org.id}, 'Scan smoke subject', ${TARGET})
      returning id`;

    const scan = await startScan(scope, { businessId: business.id });
    console.log(`scan ${scan!.id} queued against ${TARGET}`);

    const deadline = Date.now() + TIMEOUT_MS;
    let status = "queued";
    let score: number | null = null;

    while (Date.now() < deadline) {
      const [row] = await sql<{ status: string; score: number | null }[]>`
        select status, score from scans where id = ${scan!.id}`;
      status = row.status;
      score = row.score;
      if (status === "complete" || status === "failed") break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    console.log(`status=${status} score=${score ?? "none"} credits=${await creditBalance(scope)}`);
    for (const pillar of await latestPillarResults(scope, scan!.id)) {
      console.log(
        `  ${pillar.pillar}: ${pillar.status} score=${pillar.score ?? "none"}${pillar.detail ? ` (${pillar.detail})` : ""}`,
      );
    }

    if (status !== "complete" && status !== "failed") {
      throw new Error(`scan never finished within ${TIMEOUT_MS}ms`);
    }
  } finally {
    // orgs cascades to businesses, scans, pillar_results and jobs.
    await sql`delete from jobs where org_id = ${org.id}`;
    await sql`delete from credits_ledger where org_id = ${org.id}`;
    await sql`delete from orgs where id = ${org.id}`;
    console.log("cleaned up");
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
