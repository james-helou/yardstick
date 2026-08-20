/**
 * The queue worker. Runs as its own long-lived Railway service.
 *
 * This is the shape the job queue was designed for: claim, run, repeat, in a process
 * that can take three minutes over a scan without anything timing out.
 */
import { closeDb, closeDirectDb } from "../src/lib/db/client";
import { migrate } from "../src/lib/db/migrate";
import { handlers } from "../src/lib/jobs/handlers";
import { reapStuckJobs } from "../src/lib/jobs/queue";
import { runOnce } from "../src/lib/jobs/worker";

const WORKER_ID = `${process.env.RAILWAY_SERVICE_NAME ?? "worker"}-${process.pid}`;
const IDLE_SLEEP_MS = 2_000;
const REAP_EVERY_MS = 60_000;
const STUCK_AFTER_MS = 10 * 60_000;

const controller = new AbortController();
let shuttingDown = false;

function requestShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[worker] ${signal} received, finishing the current batch`);
  controller.abort();
}

process.on("SIGTERM", () => requestShutdown("SIGTERM"));
process.on("SIGINT", () => requestShutdown("SIGINT"));

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  // The worker and the web service boot in whatever order Railway feels like, so the
  // worker cannot assume the schema is already there. migrate() takes an advisory lock,
  // so both running it at once is safe and the second one is a no-op.
  const applied = await migrate();
  if (applied.length > 0) console.log(`[worker] applied ${applied.length} migration(s)`);
  await closeDirectDb();

  console.log(`[worker] ${WORKER_ID} started, ${Object.keys(handlers).length} handlers registered`);
  let lastReap = 0;

  while (!controller.signal.aborted) {
    // A worker killed mid-job leaves its row in `running`. Nothing else will free it.
    if (Date.now() - lastReap > REAP_EVERY_MS) {
      lastReap = Date.now();
      const reaped = await reapStuckJobs({ olderThanMs: STUCK_AFTER_MS });
      if (reaped > 0) console.log(`[worker] reclaimed ${reaped} stuck job(s)`);
    }

    const result = await runOnce({
      worker: WORKER_ID,
      handlers,
      batchSize: 5,
      signal: controller.signal,
    });

    if (result.claimed > 0) {
      console.log(
        `[worker] ${result.completed} completed, ${result.failed} failed of ${result.claimed}`,
      );
      continue; // More may be waiting; do not sleep on a busy queue.
    }

    await sleep(IDLE_SLEEP_MS);
  }

  await closeDb();
  console.log("[worker] stopped cleanly");
}

main().catch(async (error) => {
  console.error("[worker] fatal", error);
  await closeDb().catch(() => {});
  process.exit(1);
});
