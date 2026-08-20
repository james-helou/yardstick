import { beforeEach, describe, expect, it } from "vitest";
import { parseListQuery, type ListQuery } from "@/lib/list/query";
import type { PillarOutcome } from "@/lib/scans/score";
import { resetTables } from "@/test/db";
import { createBusiness } from "./businesses";
import { createOrg } from "./orgs";
import {
  countScansByStatus,
  createScan,
  finalizeScan,
  getScan,
  latestPillarResults,
  listScans,
  markScanRunning,
  recordPillarResult,
  SCAN_LIST_SPEC,
  type ScanSort,
} from "./scans";

const query = (params: Record<string, string> = {}): ListQuery<ScanSort> =>
  parseListQuery(params, SCAN_LIST_SPEC);

const outcome = (pillar: PillarOutcome["pillar"], score: number): PillarOutcome => ({
  pillar,
  status: "ok",
  score,
  findings: [{ code: "c", label: "A check", ok: score > 50, weight: 1 }],
});

async function workspace(name: string) {
  const org = await createOrg({ name, slug: name.toLowerCase().replace(/\s+/g, "-") });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: `${name} client`, status: "prospect" });
  return { scope, business };
}

beforeEach(() => resetTables());

describe("scans repository", () => {
  it("creates a scan for a business in the workspace", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = await createScan(scope, { businessId: business.id });

    expect(scan?.status).toBe("queued");
    expect(scan?.score).toBeNull();
    expect(scan?.businessId).toBe(business.id);
  });

  it("refuses to scan a business belonging to another workspace", async () => {
    const a = await workspace("Agency A");
    const b = await workspace("Agency B");
    expect(await createScan(a.scope, { businessId: b.business.id })).toBeNull();
  });

  it("does not read another workspace's scan", async () => {
    const a = await workspace("Agency A");
    const b = await workspace("Agency B");
    const scan = await createScan(a.scope, { businessId: a.business.id });
    expect(await getScan(b.scope, scan!.id)).toBeNull();
    expect(await getScan(a.scope, scan!.id)).toMatchObject({ businessName: "Agency A client" });
  });

  it("keeps every pillar row and reads back only the newest per pillar", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;

    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("gbp", 40) });
    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("gbp", 90) });

    const latest = await latestPillarResults(scope, scan.id);
    expect(latest).toHaveLength(1);
    expect(latest[0].score).toBe(90);
    expect(latest[0].findings[0].label).toBe("A check");
  });

  it("will not attach a pillar result to another workspace's scan", async () => {
    const a = await workspace("Agency A");
    const b = await workspace("Agency B");
    const scan = (await createScan(a.scope, { businessId: a.business.id }))!;
    expect(await recordPillarResult(b.scope, { scanId: scan.id, outcome: outcome("gbp", 90) })).toBeNull();
  });

  it("holds off finalising until every pillar has reported", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;

    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("gbp", 90) });
    expect(await finalizeScan(scope, scan.id)).toBeNull();

    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("reputation", 60) });
    expect(await finalizeScan(scope, scan.id)).toBeNull();

    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("site_health", 40) });
    const finished = await finalizeScan(scope, scan.id);
    expect(finished?.status).toBe("complete");
    expect(finished?.score).toBe(67);
    expect(finished?.finishedAt).toBeInstanceOf(Date);
  });

  it("finalises once even when every pillar finishes at the same moment", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;
    for (const p of ["gbp", "reputation", "site_health"] as const) {
      await recordPillarResult(scope, { scanId: scan.id, outcome: outcome(p, 80) });
    }

    const [first, second, third] = await Promise.all([
      finalizeScan(scope, scan.id),
      finalizeScan(scope, scan.id),
      finalizeScan(scope, scan.id),
    ]);

    // All three see the finished scan, and it finished exactly once.
    const stamps = [first, second, third].map((s) => s?.finishedAt?.getTime());
    expect(new Set(stamps).size).toBe(1);
    expect(first?.score).toBe(80);
  });

  it("fails a scan where nothing could be measured, rather than scoring it zero", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;
    for (const p of ["gbp", "reputation", "site_health"] as const) {
      await recordPillarResult(scope, {
        scanId: scan.id,
        outcome: { pillar: p, status: "skipped", findings: [], detail: "not configured" },
      });
    }

    const finished = await finalizeScan(scope, scan.id);
    expect(finished?.status).toBe("failed");
    expect(finished?.score).toBeNull();
  });

  it("scores out of the pillars that ran when a provider was unconfigured", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;
    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("gbp", 90) });
    await recordPillarResult(scope, { scanId: scan.id, outcome: outcome("site_health", 40) });
    await recordPillarResult(scope, {
      scanId: scan.id,
      outcome: { pillar: "reputation", status: "skipped", findings: [], detail: "Places is not configured" },
    });

    expect((await finalizeScan(scope, scan.id))?.score).toBe(71);
  });

  it("starts the clock once, however many pillars call it", async () => {
    const { scope, business } = await workspace("Agency A");
    const scan = (await createScan(scope, { businessId: business.id }))!;

    await markScanRunning(scope, scan.id);
    const first = await getScan(scope, scan.id);
    await markScanRunning(scope, scan.id);
    const second = await getScan(scope, scan.id);

    expect(first?.status).toBe("running");
    expect(second?.startedAt?.getTime()).toBe(first?.startedAt?.getTime());
  });

  it("lists scans with their business, scoped and paginated", async () => {
    const a = await workspace("Agency A");
    const b = await workspace("Agency B");
    await createScan(a.scope, { businessId: a.business.id });
    await createScan(b.scope, { businessId: b.business.id });

    const listed = await listScans(a.scope, query());
    expect(listed.window.total).toBe(1);
    expect(listed.rows[0].businessName).toBe("Agency A client");
  });

  it("filters the list to one business when asked", async () => {
    const { scope, business } = await workspace("Agency A");
    const other = await createBusiness(scope, { name: "Second client", status: "prospect" });
    await createScan(scope, { businessId: business.id });
    await createScan(scope, { businessId: other.id });

    const listed = await listScans(scope, query(), { businessId: other.id });
    expect(listed.window.total).toBe(1);
    expect(listed.rows[0].businessName).toBe("Second client");
  });

  it("searches by the business name", async () => {
    const { scope, business } = await workspace("Agency A");
    await createScan(scope, { businessId: business.id });
    expect((await listScans(scope, query({ q: "agency a" }))).window.total).toBe(1);
    expect((await listScans(scope, query({ q: "nobody" }))).window.total).toBe(0);
  });

  it("counts by status for the tiles", async () => {
    const { scope, business } = await workspace("Agency A");
    await createScan(scope, { businessId: business.id });
    expect(await countScansByStatus(scope)).toMatchObject({ queued: 1, complete: 0 });
  });
});
