/**
 * Live queue round-trip. Creates one throwaway org, enqueues a job of a kind no handler
 * knows, waits for the worker to bury it, then deletes everything it created.
 * Read-nothing-else, write-nothing-else.
 */
import { closeDb, db } from "../src/lib/db/client";
import { enqueue } from "../src/lib/jobs/queue";

async function main() {
  const sql = db();
  const [org] = await sql<{ id: string }[]>`
    insert into orgs (name, slug) values ('queue smoke', ${`queue-smoke-${process.pid}`})
    returning id`;
  const scope = { orgId: org.id };
  let jobId: string | null = null;
  try {
    const job = await enqueue(scope, { kind: "smoke.unregistered", payload: { ping: true } });
    jobId = job!.id;
    console.log(`enqueued ${jobId}`);
    for (let i = 0; i < 30; i += 1) {
      const [row] = await sql<{ status: string; attempts: number; last_error: string | null }[]>`
        select status, attempts, last_error from jobs where id = ${jobId}`;
      if (row.status !== "pending" && row.status !== "running") {
        console.log(`status=${row.status} attempts=${row.attempts} error=${row.last_error}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  } finally {
    if (jobId) await sql`delete from jobs where id = ${jobId}`;
    await sql`delete from orgs where id = ${org.id}`;
    console.log("cleaned up");
    await closeDb();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
