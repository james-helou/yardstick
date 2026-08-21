import { catchUp, nextRun, type Cadence } from "@/lib/tracking/cadence";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

/**
 * Recurring measurement, stored.
 *
 * One function here takes no scope: `claimDueSchedules` is the worker's sweep across
 * every workspace at once, the same shape as reaping stuck jobs. It claims by moving
 * `next_run_at` forward inside the transaction that selects the row, so two workers
 * sweeping at the same moment cannot both run the same business.
 */

export type Schedule = {
  id: string;
  orgId: string;
  businessId: string;
  cadence: Cadence;
  nextRunAt: Date;
  lastRunAt: Date | null;
  lastScanId: string | null;
  pausedAt: Date | null;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  business_id: string;
  cadence: Cadence;
  next_run_at: Date;
  last_run_at: Date | null;
  last_scan_id: string | null;
  paused_at: Date | null;
  created_at: Date;
};

const toSchedule = (r: Row): Schedule => ({
  id: r.id,
  orgId: r.org_id,
  businessId: r.business_id,
  cadence: r.cadence,
  nextRunAt: new Date(r.next_run_at),
  lastRunAt: r.last_run_at === null ? null : new Date(r.last_run_at),
  lastScanId: r.last_scan_id,
  pausedAt: r.paused_at === null ? null : new Date(r.paused_at),
  createdAt: new Date(r.created_at),
});

export const isPaused = (schedule: Schedule): boolean => schedule.pausedAt !== null;

/**
 * Starts or changes tracking. Changing the cadence re-dates the next run from now, which
 * is what someone means when they move a client from monthly to weekly: sooner, not at
 * whatever date the old cadence had already booked.
 */
export async function setSchedule(
  scope: OrgScope,
  input: { businessId: string; cadence: Cadence; from?: Date },
): Promise<Schedule | null> {
  const orgId = requireOrg(scope);
  const from = input.from ?? new Date();
  const due = nextRun(input.cadence, from);

  // Selecting from businesses is the tenancy check: another workspace's business produces
  // no row at all rather than a schedule pointed at somebody else's client.
  const [row] = await db()<Row[]>`
    insert into scan_schedules (org_id, business_id, cadence, next_run_at)
    select ${orgId}, b.id, ${input.cadence}, ${due}
      from businesses b where b.id = ${input.businessId} and b.org_id = ${orgId}
    on conflict (business_id) do update
      set cadence = excluded.cadence, next_run_at = excluded.next_run_at, paused_at = null
    returning *
  `;
  return row ? toSchedule(row) : null;
}

export async function getSchedule(scope: OrgScope, businessId: string): Promise<Schedule | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    select * from scan_schedules where business_id = ${businessId} and org_id = ${orgId}
  `;
  return row ? toSchedule(row) : null;
}

export async function listSchedules(scope: OrgScope): Promise<Schedule[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from scan_schedules where org_id = ${orgId} order by next_run_at asc
  `;
  return rows.map(toSchedule);
}

/** Pausing keeps the cadence. Resuming re-dates from now, so a long pause cannot fire late. */
export async function pauseSchedule(scope: OrgScope, businessId: string): Promise<Schedule | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    update scan_schedules set paused_at = now()
     where business_id = ${businessId} and org_id = ${orgId} and paused_at is null
    returning *
  `;
  return row ? toSchedule(row) : null;
}

export async function resumeSchedule(
  scope: OrgScope,
  businessId: string,
  options: { from?: Date } = {},
): Promise<Schedule | null> {
  const existing = await getSchedule(scope, businessId);
  if (!existing) return null;

  const orgId = requireOrg(scope);
  const due = nextRun(existing.cadence, options.from ?? new Date());
  const [row] = await db()<Row[]>`
    update scan_schedules set paused_at = null, next_run_at = ${due}
     where business_id = ${businessId} and org_id = ${orgId}
    returning *
  `;
  return row ? toSchedule(row) : null;
}

export async function stopSchedule(scope: OrgScope, businessId: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ id: string }[]>`
    delete from scan_schedules where business_id = ${businessId} and org_id = ${orgId} returning id
  `;
  return rows.length > 0;
}

/**
 * The worker's sweep. No scope: this crosses every workspace, exactly like reaping stuck
 * jobs, and each claimed row carries the org it belongs to so everything downstream is
 * scoped again by that.
 *
 * `for update skip locked` plus moving `next_run_at` forward in the same transaction is
 * what makes a claim exclusive. A business that was missed for a month is caught up to
 * one run, not one run per missed period.
 */
export async function claimDueSchedules(options: { limit?: number; now?: Date } = {}): Promise<Schedule[]> {
  const { limit = 20 } = options;
  const now = options.now ?? new Date();

  return db().begin(async (tx) => {
    const rows = await tx<Row[]>`
      select * from scan_schedules
       where paused_at is null and next_run_at <= ${now}
       order by next_run_at asc
       limit ${limit}
       for update skip locked
    `;

    const claimed: Schedule[] = [];
    for (const row of rows) {
      const schedule = toSchedule(row);
      const due = catchUp(schedule.cadence, schedule.nextRunAt, now);
      await tx`
        update scan_schedules set next_run_at = ${due}, last_run_at = ${now} where id = ${schedule.id}
      `;
      claimed.push({ ...schedule, nextRunAt: due, lastRunAt: now });
    }
    return claimed;
  });
}

/** Best effort: which scan the sweep actually started, so the screen can link to it. */
export async function recordScheduledScan(scheduleId: string, scanId: string): Promise<void> {
  await db()`update scan_schedules set last_scan_id = ${scanId} where id = ${scheduleId}`;
}
