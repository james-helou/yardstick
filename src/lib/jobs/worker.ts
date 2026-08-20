import { buryJob, claimJobs, completeJob, failJob, type Job } from "./queue";

export type JobHandler = (job: Job) => Promise<void>;
export type JobHandlers = Record<string, JobHandler>;

export type RunResult = { claimed: number; completed: number; failed: number };

/**
 * Claims one batch and runs it. Every outcome is written back to the row before this
 * returns, so a job is never left in `running` because the process moved on.
 *
 * A job whose `kind` has no registered handler is buried rather than retried: no amount
 * of waiting will conjure the handler, and a job that retries forever hides a deploy bug.
 */
export async function runOnce(options: {
  worker: string;
  handlers: JobHandlers;
  batchSize?: number;
  signal?: AbortSignal;
  now?: Date;
}): Promise<RunResult> {
  const { worker, handlers, batchSize = 5, signal, now } = options;

  if (signal?.aborted) return { claimed: 0, completed: 0, failed: 0 };

  const jobs = await claimJobs({ worker, limit: batchSize, now });
  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    const handler = handlers[job.kind];

    if (!handler) {
      await buryJob(job.id, `No handler registered for job kind "${job.kind}"`);
      failed += 1;
      continue;
    }

    try {
      await handler(job);
      await completeJob(job.id);
      completed += 1;
    } catch (error) {
      await failJob(job.id, error instanceof Error ? error.message : String(error));
      failed += 1;
    }
  }

  return { claimed: jobs.length, completed, failed };
}
