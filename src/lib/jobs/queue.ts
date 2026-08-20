import { db } from "@/lib/db/client";
import { requireOrg, type OrgScope } from "@/lib/db/scope";

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export type JobStatus = "pending" | "running" | "done" | "failed";

export type Job = {
  id: string;
  orgId: string;
  kind: string;
  payload: JsonObject;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAfter: Date;
  lockedBy: string | null;
  lockedAt: Date | null;
  lastError: string | null;
  idempotencyKey: string | null;
  createdAt: Date;
};

type JobRow = {
  id: string;
  org_id: string;
  kind: string;
  payload: JsonObject;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_after: Date;
  locked_by: string | null;
  locked_at: Date | null;
  last_error: string | null;
  idempotency_key: string | null;
  created_at: Date;
};

/** Driver types are coerced here, at the boundary. */
const toJob = (r: JobRow): Job => ({
  id: r.id,
  orgId: r.org_id,
  kind: r.kind,
  payload: r.payload,
  status: r.status,
  attempts: Number(r.attempts),
  maxAttempts: Number(r.max_attempts),
  runAfter: new Date(r.run_after),
  lockedBy: r.locked_by,
  lockedAt: r.locked_at ? new Date(r.locked_at) : null,
  lastError: r.last_error,
  idempotencyKey: r.idempotency_key,
  createdAt: new Date(r.created_at),
});

const RETRY_BASE_MS = 30_000;

export type EnqueueInput = {
  kind: string;
  payload: JsonObject;
  runAfter?: Date;
  maxAttempts?: number;
  /** Present means at-most-once: a second enqueue with the same key is a no-op. */
  idempotencyKey?: string;
};

export async function enqueue(scope: OrgScope, input: EnqueueInput): Promise<Job | null> {
  const orgId = requireOrg(scope);
  const rows = await db()<JobRow[]>`
    insert into jobs (org_id, kind, payload, run_after, max_attempts, idempotency_key)
    values (
      ${orgId},
      ${input.kind},
      ${db().json(input.payload)},
      ${input.runAfter ?? new Date()},
      ${input.maxAttempts ?? 5},
      ${input.idempotencyKey ?? null}
    )
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning *
  `;
  return rows.length ? toJob(rows[0]) : null;
}

/**
 * Claims up to `limit` due jobs. FOR UPDATE SKIP LOCKED is what makes concurrent
 * workers safe: a row another worker holds is passed over rather than waited on.
 */
export async function claimJobs(options: {
  worker: string;
  limit: number;
  now?: Date;
}): Promise<Job[]> {
  const now = options.now ?? new Date();
  const rows = await db()<JobRow[]>`
    update jobs j
       set status    = 'running',
           attempts  = j.attempts + 1,
           locked_by = ${options.worker},
           locked_at = ${now},
           updated_at = ${now}
     where j.id in (
       select id from jobs
        where status = 'pending' and run_after <= ${now}
        order by run_after asc
        limit ${options.limit}
        for update skip locked
     )
    returning *
  `;
  return rows.map(toJob).sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime());
}

export async function completeJob(id: string): Promise<Job | null> {
  const rows = await db()<JobRow[]>`
    update jobs
       set status = 'done', locked_by = null, locked_at = null, updated_at = now()
     where id = ${id}
    returning *
  `;
  return rows.length ? toJob(rows[0]) : null;
}

/**
 * Returns the job to the queue with exponential backoff, or buries it once it has
 * burned through max_attempts. Either way the error is recorded, never swallowed.
 */
export async function failJob(id: string, error: string): Promise<Job | null> {
  const rows = await db()<JobRow[]>`
    update jobs
       set status = case when attempts >= max_attempts then 'failed' else 'pending' end,
           run_after = case
             when attempts >= max_attempts then run_after
             else now() + make_interval(secs => ${RETRY_BASE_MS / 1000} * power(2, attempts - 1))
           end,
           locked_by = null,
           locked_at = null,
           last_error = ${error},
           updated_at = now()
     where id = ${id}
    returning *
  `;
  return rows.length ? toJob(rows[0]) : null;
}

/** A worker that died mid-job leaves a row stuck in `running`. Cron calls this. */
export async function reapStuckJobs(options: { olderThanMs: number }): Promise<number> {
  const rows = await db()<{ id: string }[]>`
    update jobs
       set status = 'pending', locked_by = null, locked_at = null,
           last_error = coalesce(last_error, 'reclaimed from a worker that stopped reporting'),
           updated_at = now()
     where status = 'running'
       and locked_at <= now() - make_interval(secs => ${options.olderThanMs / 1000})
    returning id
  `;
  return rows.length;
}
