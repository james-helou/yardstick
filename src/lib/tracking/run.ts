import { claimDueSchedules, recordScheduledScan, type Schedule } from "@/lib/db/repos/schedules";
import { startScan } from "@/lib/scans/runner";

/**
 * The sweep the worker runs: everything owed a measurement, measured.
 *
 * Claiming and starting are separate on purpose. The claim has already moved the schedule
 * forward by the time a scan is started, so a business that fails to start is retried at
 * its next due date rather than on the next tick, which is what keeps a broken business
 * from consuming the sweep.
 */

export type SweepDeps = {
  claim?: typeof claimDueSchedules;
  start?: typeof startScan;
  record?: typeof recordScheduledScan;
  now?: Date;
  limit?: number;
};

export type SweepResult = { claimed: number; started: number; skipped: number };

export async function sweepSchedules(deps: SweepDeps = {}): Promise<SweepResult> {
  const claim = deps.claim ?? claimDueSchedules;
  const start = deps.start ?? startScan;
  const record = deps.record ?? recordScheduledScan;

  const due: Schedule[] = await claim({ limit: deps.limit ?? 20, now: deps.now });
  let started = 0;
  let skipped = 0;

  for (const schedule of due) {
    const scan = await start({ orgId: schedule.orgId }, { businessId: schedule.businessId });
    if (!scan) {
      // The business went away between the claim and the start. Nothing to measure, and
      // the schedule will be removed with it by the cascade.
      skipped += 1;
      continue;
    }
    await record(schedule.id, scan.id);
    started += 1;
  }

  return { claimed: due.length, started, skipped };
}
