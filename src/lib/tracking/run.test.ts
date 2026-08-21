import { beforeEach, describe, expect, it } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import {
  claimDueSchedules,
  getSchedule,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  setSchedule,
  stopSchedule,
} from "@/lib/db/repos/schedules";
import { resetTables } from "@/test/db";
import { nextRun } from "./cadence";
import { sweepSchedules } from "./run";

const NOW = new Date("2026-08-20T09:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const DAY = 24 * 60 * 60 * 1000;

async function withBusiness(slug: string, name = "Rivera Plumbing") {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name, status: "client" });
  return { scope, businessId: business.id };
}

beforeEach(() => resetTables());

describe("setting up tracking", () => {
  it("books the first run one period out", async () => {
    const { scope, businessId } = await withBusiness("agency-a");

    const schedule = await setSchedule(scope, { businessId, cadence: "monthly", from: NOW });
    expect(schedule!.cadence).toBe("monthly");
    expect(schedule!.nextRunAt).toEqual(nextRun("monthly", NOW));
    expect(schedule!.pausedAt).toBeNull();
  });

  it("keeps one schedule per business, and changing the cadence re-dates from now", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "quarterly", from: NOW });
    const changed = await setSchedule(scope, { businessId, cadence: "weekly", from: NOW });

    expect(await listSchedules(scope)).toHaveLength(1);
    // Moving a client to weekly means sooner, not on the date the old cadence had booked.
    expect(changed!.nextRunAt).toEqual(nextRun("weekly", NOW));
  });

  it("refuses to track another workspace's business", async () => {
    const a = await withBusiness("agency-a");
    const b = await withBusiness("agency-b", "Delacroix Dental");

    expect(await setSchedule(b.scope, { businessId: a.businessId, cadence: "weekly" })).toBeNull();
    expect(await getSchedule(b.scope, a.businessId)).toBeNull();
    expect(await listSchedules(b.scope)).toEqual([]);
  });

  it("pauses without forgetting the cadence, and resumes from now", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: NOW });

    const paused = await pauseSchedule(scope, businessId);
    expect(paused!.pausedAt).not.toBeNull();
    expect(paused!.cadence).toBe("weekly");
    // Pausing twice is not an error, it is already done.
    expect(await pauseSchedule(scope, businessId)).toBeNull();

    const resumed = await resumeSchedule(scope, businessId, { from: later(30 * DAY) });
    expect(resumed!.pausedAt).toBeNull();
    // A month of pause must not produce a scan that was owed a month ago.
    expect(resumed!.nextRunAt.getTime()).toBeGreaterThan(later(30 * DAY).getTime());
  });

  it("stops for good when asked", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: NOW });

    expect(await stopSchedule(scope, businessId)).toBe(true);
    expect(await getSchedule(scope, businessId)).toBeNull();
    expect(await stopSchedule(scope, businessId)).toBe(false);
  });
});

describe("the worker's sweep", () => {
  it("claims only what is owed, and only what is running", async () => {
    const a = await withBusiness("agency-a");
    const b = await withBusiness("agency-b", "Delacroix Dental");
    const c = await withBusiness("agency-c", "Northline Roofing");

    await setSchedule(a.scope, { businessId: a.businessId, cadence: "weekly", from: later(-8 * DAY) });
    await setSchedule(b.scope, { businessId: b.businessId, cadence: "weekly", from: NOW });
    await setSchedule(c.scope, { businessId: c.businessId, cadence: "weekly", from: later(-8 * DAY) });
    await pauseSchedule(c.scope, c.businessId);

    const claimed = await claimDueSchedules({ now: NOW });
    expect(claimed.map((s) => s.businessId)).toEqual([a.businessId]);
  });

  it("moves the claim forward so a second sweep finds nothing", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: later(-8 * DAY) });

    expect(await claimDueSchedules({ now: NOW })).toHaveLength(1);
    expect(await claimDueSchedules({ now: NOW })).toEqual([]);

    const after = await getSchedule(scope, businessId);
    expect(after!.nextRunAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(after!.lastRunAt).toEqual(NOW);
  });

  it("catches up a long outage to one run, not one per missed week", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: later(-365 * DAY) });

    const claimed = await claimDueSchedules({ now: NOW });
    expect(claimed).toHaveLength(1);
    // A year of misses is one measurement, and the next one is a week out.
    expect(claimed[0].nextRunAt.getTime()).toBeGreaterThan(NOW.getTime());
    expect(claimed[0].nextRunAt.getTime()).toBeLessThanOrEqual(NOW.getTime() + 7 * DAY);
    expect(await claimDueSchedules({ now: NOW })).toEqual([]);
  });

  it("starts a scan for everything it claimed, in the workspace that owns it", async () => {
    const a = await withBusiness("agency-a");
    const b = await withBusiness("agency-b", "Delacroix Dental");
    await setSchedule(a.scope, { businessId: a.businessId, cadence: "weekly", from: later(-8 * DAY) });
    await setSchedule(b.scope, { businessId: b.businessId, cadence: "monthly", from: later(-40 * DAY) });

    const started: { orgId: string; businessId: string }[] = [];
    const result = await sweepSchedules({
      now: NOW,
      start: async (scope, input) => {
        started.push({ orgId: scope.orgId, businessId: input.businessId });
        return { id: `scan-${started.length}` };
      },
      record: async () => {},
    });

    expect(result).toEqual({ claimed: 2, started: 2, skipped: 0 });
    expect(started).toContainEqual({ orgId: a.scope.orgId, businessId: a.businessId });
    expect(started).toContainEqual({ orgId: b.scope.orgId, businessId: b.businessId });
  });

  it("really does enqueue a scan, end to end", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: later(-8 * DAY) });

    const result = await sweepSchedules({ now: NOW });
    expect(result.started).toBe(1);

    const schedule = await getSchedule(scope, businessId);
    expect(schedule!.lastScanId).not.toBeNull();

    const { getScan } = await import("@/lib/db/repos/scans");
    const scan = await getScan(scope, schedule!.lastScanId!);
    expect(scan!.businessId).toBe(businessId);
    expect(scan!.status).toBe("queued");
    // Nobody asked for it: a scheduled scan has no requesting user.
    expect(scan!.requestedBy).toBeNull();
  });

  it("counts a business that disappeared as skipped, not as a failure", async () => {
    const { scope, businessId } = await withBusiness("agency-a");
    await setSchedule(scope, { businessId, cadence: "weekly", from: later(-8 * DAY) });

    const result = await sweepSchedules({ now: NOW, start: async () => null, record: async () => {} });
    expect(result).toEqual({ claimed: 1, started: 0, skipped: 1 });
  });

  it("does nothing at all when nothing is owed", async () => {
    expect(await sweepSchedules({ now: NOW })).toEqual({ claimed: 0, started: 0, skipped: 0 });
  });
});
