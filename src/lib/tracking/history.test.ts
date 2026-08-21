import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import { createScan, pillarScoresFor, recordPillarResult, scoreHistory } from "@/lib/db/repos/scans";
import { resetTables } from "@/test/db";
import { trendFor } from "./history";

async function workspace(slug: string) {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: "Rivera Plumbing", status: "client" });
  return { scope, businessId: business.id };
}

/**
 * A finished measurement, dated. The finish date has to be written directly: a scan
 * finishes when the worker says so, and a trend test needs months of them.
 */
async function measured(
  scope: { orgId: string },
  businessId: string,
  input: { at: string; score: number; pillars?: Record<string, number>; status?: string },
) {
  const scan = await createScan(scope, { businessId });
  const at = new Date(input.at);

  for (const [pillar, score] of Object.entries(input.pillars ?? {})) {
    await recordPillarResult(scope, {
      scanId: scan!.id,
      outcome: { pillar: pillar as "gbp", status: "ok", score, findings: [] },
    });
  }

  await db()`
    update scans set status = ${input.status ?? "complete"}, score = ${input.score},
                     finished_at = ${at}, created_at = ${at}
     where id = ${scan!.id}
  `;
  return scan!.id;
}

beforeEach(() => resetTables());

describe("what a business has done over time", () => {
  it("reads oldest first, and only counts finished measurements", async () => {
    const { scope, businessId } = await workspace("agency-a");
    await measured(scope, businessId, { at: "2026-03-01T09:00:00Z", score: 54 });
    await measured(scope, businessId, { at: "2026-04-01T09:00:00Z", score: 61 });
    // A failed scan is a gap in the record, not a collapse in the rankings.
    await measured(scope, businessId, { at: "2026-04-15T09:00:00Z", score: 0, status: "failed" });
    await measured(scope, businessId, { at: "2026-05-01T09:00:00Z", score: 70 });

    const history = await scoreHistory(scope, businessId);
    expect(history.map((p) => p.score)).toEqual([54, 61, 70]);
  });

  it("keeps the most recent measurements when there are more than it asked for", async () => {
    const { scope, businessId } = await workspace("agency-a");
    for (const day of [1, 2, 3, 4, 5]) {
      await measured(scope, businessId, { at: `2026-03-0${day}T09:00:00Z`, score: 50 + day });
    }

    const history = await scoreHistory(scope, businessId, { limit: 3 });
    // The newest three, still oldest first.
    expect(history.map((p) => p.score)).toEqual([53, 54, 55]);
  });

  it("reports the movement, and what led it", async () => {
    const { scope, businessId } = await workspace("agency-a");
    await measured(scope, businessId, {
      at: "2026-03-01T09:00:00Z",
      score: 54,
      pillars: { gbp: 40, reputation: 70 },
    });
    await measured(scope, businessId, { at: "2026-04-01T09:00:00Z", score: 66 });
    await measured(scope, businessId, {
      at: "2026-06-01T09:00:00Z",
      score: 78,
      pillars: { gbp: 82, reputation: 66 },
    });

    const trend = await trendFor(scope, businessId);
    expect(trend.change).toBe(24);
    expect(trend.points).toHaveLength(3);
    expect(trend.best).toMatchObject({ pillar: "gbp", change: 42 });
    expect(trend.headline).toMatch(/^Up 24 points over 3 months, now 78\./);
  });

  it("anchors on the day they signed", async () => {
    const { scope, businessId } = await workspace("agency-a");
    await measured(scope, businessId, { at: "2026-03-01T09:00:00Z", score: 30, pillars: { gbp: 20 } });
    await measured(scope, businessId, { at: "2026-05-01T09:00:00Z", score: 66, pillars: { gbp: 60 } });
    await measured(scope, businessId, { at: "2026-06-01T09:00:00Z", score: 78, pillars: { gbp: 82 } });

    const trend = await trendFor(scope, businessId, { since: new Date("2026-05-01T00:00:00Z") });
    expect(trend.points).toHaveLength(2);
    expect(trend.change).toBe(12);
    // The pillars compared are the ends of the window shown, not of everything ever run.
    expect(trend.best).toMatchObject({ pillar: "gbp", change: 22 });
  });

  it("does not treat a pillar that could not run as a zero", async () => {
    const { scope, businessId } = await workspace("agency-a");
    const first = await measured(scope, businessId, {
      at: "2026-03-01T09:00:00Z",
      score: 54,
      pillars: { gbp: 40 },
    });
    await recordPillarResult(scope, {
      scanId: first,
      outcome: {
        pillar: "geogrid",
        status: "skipped",
        findings: [],
        detail: "No rank provider configured",
      },
    });

    const scores = await pillarScoresFor(scope, [first]);
    expect(scores.get(first)).toEqual({ gbp: 40 });
  });

  it("says plainly when there is only one measurement", async () => {
    const { scope, businessId } = await workspace("agency-a");
    await measured(scope, businessId, { at: "2026-03-01T09:00:00Z", score: 54 });

    const trend = await trendFor(scope, businessId);
    expect(trend.headline).toMatch(/Measured once/);
  });

  it("never shows one workspace another's history", async () => {
    const a = await workspace("agency-a");
    const b = await workspace("agency-b");
    const scanId = await measured(a.scope, a.businessId, { at: "2026-03-01T09:00:00Z", score: 54 });

    expect(await scoreHistory(b.scope, a.businessId)).toEqual([]);
    expect(await pillarScoresFor(b.scope, [scanId])).toEqual(new Map());
    expect((await trendFor(b.scope, a.businessId)).headline).toBe("Nothing measured yet.");
  });
});
