import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import { getScan, latestPillarResults } from "@/lib/db/repos/scans";
import { claimJobs } from "@/lib/jobs/queue";
import { PILLARS } from "./pillars";
import { runOnce } from "@/lib/jobs/worker";
import type { PlaceDetails, PlacesProvider } from "@/lib/places";
import type { SiteProbe } from "@/lib/site/probe";
import { resetTables } from "@/test/db";
import { creditBalance, grantCredits, listCreditEntries } from "@/lib/db/repos/credits";
import { listGridPoints } from "@/lib/db/repos/grid";
import type { RankProvider } from "@/lib/rank";
import { describeAge, runPillar, scanHandlers, SCAN_PILLAR, SCAN_START, startScan } from "./runner";

const DETAILS: PlaceDetails = {
  placeId: "p1",
  name: "Bright Smile Dental",
  addressLine: "4200 Rue Sainte-Catherine O",
  locality: "Montreal",
  primaryCategory: "Dentist",
  websiteUrl: "https://brightsmile.ca",
  phone: "+1 514-555-0100",
  openingHours: ["Monday: 9 to 5"],
  description: "A dental clinic",
  photoCount: 8,
  businessStatus: "OPERATIONAL",
  rating: 4.8,
  reviewCount: 140,
  reviews: [{ rating: 5, publishedAt: new Date().toISOString() }],
};

const PROBE: SiteProbe = {
  requestedUrl: "https://brightsmile.ca",
  finalUrl: "https://brightsmile.ca/",
  status: 200,
  https: true,
  responseMs: 300,
  htmlBytes: 1000,
  title: "Bright Smile Dental, Montreal",
  metaDescription: "A dental clinic in downtown Montreal offering implants, whitening and family care.",
  h1Count: 1,
  hasViewport: true,
  hasCanonical: true,
  noindex: false,
  structuredDataTypes: ["Dentist"],
};

const places = (details: PlaceDetails | null = DETAILS): PlacesProvider => ({
  name: "fake-places",
  search: async () => [],
  details: async () => details,
});

type WorkspaceOptions = {
  placeId?: string | null;
  websiteUrl?: string | null;
  coordinates?: boolean;
  category?: string | null;
  credits?: number;
};

async function workspace(options: WorkspaceOptions = {}) {
  const org = await createOrg({ name: "Agency A", slug: "agency-a" });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, {
    name: "Bright Smile Dental",
    status: "prospect",
    ...(options.placeId === null ? {} : { placeId: options.placeId ?? "p1" }),
    ...(options.websiteUrl === null ? {} : { websiteUrl: options.websiteUrl ?? "https://brightsmile.ca" }),
    ...(options.coordinates === false ? {} : { latitude: 45.5017, longitude: -73.5673 }),
    ...(options.category === null ? {} : { primaryCategory: options.category ?? "Dentist" }),
  });
  if (options.credits !== 0) {
    await grantCredits(scope, { amount: options.credits ?? 10, reason: "Test grant" });
  }
  return { scope, business };
}

/** A target for the pure pillar runner, without going near the database. */
const target = (over: Partial<Parameters<typeof runPillar>[1]> = {}) => ({
  id: "b1",
  name: "Bright Smile Dental",
  placeId: "p1",
  websiteUrl: null,
  latitude: 45.5017,
  longitude: -73.5673,
  primaryCategory: "Dentist",
  ...over,
});

const ranksAt = (ranks: (number | null)[] | ((i: number) => number | null)): RankProvider => {
  let call = 0;
  return {
    name: "fake-ranks",
    rankAt: async () => {
      const index = call++;
      return typeof ranks === "function" ? ranks(index) : (ranks[index % ranks.length] ?? null);
    },
  };
};

/**
 * Drains the queue the way the worker service does, but deterministically. The clock
 * advances an hour a round so a job sitting in retry backoff becomes claimable, which
 * is the difference between "nothing left" and "nothing due yet".
 */
async function drain(handlers: ReturnType<typeof scanHandlers>, rounds = 6) {
  const base = Date.now();
  for (let i = 0; i < rounds; i++) {
    const now = new Date(base + i * 3_600_000);
    const result = await runOnce({ worker: "test", handlers, batchSize: 10, now });
    if (result.claimed === 0) return;
  }
}

beforeEach(() => resetTables());

describe("runPillar", () => {
  it("scores the Google pillars from place details", async () => {
    const gbp = await runPillar("gbp", target(), { places: places() });
    const reputation = await runPillar("reputation", target(), { places: places() });

    expect(gbp.outcome.score).toBe(100);
    expect(reputation.outcome.score).toBeGreaterThan(85);
  });

  it("reports itself skipped, with a reason, when Places is not configured", async () => {
    const { outcome } = await runPillar("gbp", target(), { places: null });
    expect(outcome).toMatchObject({ status: "skipped", detail: "Google Places is not configured yet" });
  });

  it("distinguishes an unlinked business from a listing that has gone", async () => {
    const unlinked = await runPillar("reputation", target({ placeId: null }), { places: places() });
    expect(unlinked.outcome.detail).toBe("This business is not linked to a Google listing");

    const gone = await runPillar("reputation", target(), { places: places(null) });
    expect(gone.outcome.detail).toBe("Google no longer returns this listing");
  });

  it("skips site health when there is no website to look at", async () => {
    const { outcome } = await runPillar("site_health", target({ websiteUrl: null }), { places: null });
    expect(outcome).toMatchObject({ status: "skipped", detail: "This business has no website on record" });
  });

  it("scores site health from the probe", async () => {
    const { outcome } = await runPillar("site_health", target({ websiteUrl: "https://brightsmile.ca" }), {
      places: null,
      probe: async () => PROBE,
    });
    expect(outcome.score).toBe(100);
  });

  it("searches every point of the grid and keeps the ranks", async () => {
    const run = await runPillar("geogrid", target(), {
      places: null,
      ranks: ranksAt([1, 2, 3]),
      grid: { radiusKm: 2, size: 3 },
    });

    expect(run.gridPoints).toHaveLength(9);
    expect(run.outcome.status).toBe("ok");
    expect(run.gridPoints?.every((p) => p.keyword === "Dentist")).toBe(true);
    // The centre point is the business's own coordinates.
    expect(run.gridPoints?.[4]).toMatchObject({ latitude: 45.5017, longitude: -73.5673 });
  });

  it("says what is missing rather than reporting a business as invisible", async () => {
    const noProvider = await runPillar("geogrid", target(), { places: null, ranks: null });
    expect(noProvider.outcome.detail).toBe("Rank data is not configured yet");

    const noCoords = await runPillar("geogrid", target({ latitude: null, longitude: null }), {
      places: null,
      ranks: ranksAt([1]),
    });
    expect(noCoords.outcome.detail).toMatch(/no coordinates/);

    const noKeyword = await runPillar("geogrid", target({ primaryCategory: null }), {
      places: null,
      ranks: ranksAt([1]),
    });
    expect(noKeyword.outcome.detail).toMatch(/primary category/);

    for (const run of [noProvider, noCoords, noKeyword]) {
      expect(run.outcome.status).toBe("skipped");
      expect(run.gridPoints).toBeUndefined();
    }
  });
});

describe("describeAge", () => {
  it("says how long ago in words a person would use", () => {
    expect(describeAge(10 * 60_000)).toBe("in the last hour");
    expect(describeAge(3_600_000)).toBe("1 hour ago");
    expect(describeAge(5 * 3_600_000)).toBe("5 hours ago");
    expect(describeAge(3 * 24 * 3_600_000)).toBe("3 days ago");
  });
});

describe("the scan pipeline", () => {
  it("runs end to end and scores the business", async () => {
    const { scope, business } = await workspace();
    const started = await startScan(scope, { businessId: business.id });
    expect(started).not.toBeNull();

    await drain(
      scanHandlers({
        places: places(),
        probe: async () => PROBE,
        ranks: ranksAt([1]),
        grid: { radiusKm: 2, size: 3 },
      }),
    );

    const scan = await getScan(scope, started!.id);
    expect(scan?.status).toBe("complete");
    expect(scan?.score).toBeGreaterThan(90);
    expect(scan?.startedAt).toBeInstanceOf(Date);
    expect(scan?.finishedAt).toBeInstanceOf(Date);

    const pillars = await latestPillarResults(scope, started!.id);
    expect(pillars.map((p) => p.pillar).sort()).toEqual(["gbp", "geogrid", "reputation", "site_health"]);
    // The grid was paid for out of the ledger.
    expect(await creditBalance(scope)).toBe(9);
    expect(await listGridPoints(scope, started!.id)).toHaveLength(9);
  });

  it("degrades one pillar rather than the scan when a provider is dead", async () => {
    const { scope, business } = await workspace();
    const started = await startScan(scope, { businessId: business.id });

    await drain(
      scanHandlers({
        places: {
          name: "broken",
          search: async () => [],
          details: async () => {
            throw new Error("Places is on fire");
          },
        },
        probe: async () => PROBE,
      }),
      40,
    );

    const scan = await getScan(scope, started!.id);
    const pillars = await latestPillarResults(scope, started!.id);

    expect(scan?.status).toBe("complete");
    // Only site health measured, so the scan scores out of site health alone.
    expect(scan?.score).toBe(100);
    expect(pillars.filter((p) => p.status === "failed").map((p) => p.pillar).sort()).toEqual([
      "gbp",
      "reputation",
    ]);
    expect(pillars.find((p) => p.pillar === "gbp")?.detail).toBe("Places is on fire");
  });

  it("retries a failing provider before giving up on it", async () => {
    const { scope, business } = await workspace({ placeId: null });
    const started = await startScan(scope, { businessId: business.id });
    const probe = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));

    const handlers = scanHandlers({ places: null, probe });
    await runOnce({ worker: "test", handlers, batchSize: 10 }); // scan.start
    await runOnce({ worker: "test", handlers, batchSize: 10 }); // first attempt at each pillar

    // The site-health job went back to the queue rather than recording a failure.
    expect(probe).toHaveBeenCalledTimes(1);
    const pillars = await latestPillarResults(scope, started!.id);
    expect(pillars.find((p) => p.pillar === "site_health")).toBeUndefined();
    expect((await getScan(scope, started!.id))?.status).toBe("running");
  });

  it("fans out exactly one job per pillar, even if the start job runs twice", async () => {
    const { scope, business } = await workspace();
    const started = await startScan(scope, { businessId: business.id });
    const handlers = scanHandlers({ places: places(), probe: async () => PROBE });

    const [startJob] = await claimJobs({ worker: "test", limit: 10 });
    expect(startJob.kind).toBe(SCAN_START);
    await handlers[SCAN_START](startJob);
    await handlers[SCAN_START](startJob);

    const queued = await claimJobs({ worker: "test", limit: 50 });
    expect(queued.filter((j) => j.kind === SCAN_PILLAR)).toHaveLength(PILLARS.length);
    // And the paid pillar was charged once, not once per dispatch.
    expect(await creditBalance(scope)).toBe(9);
    expect(started).not.toBeNull();
  });

  it("reports every pillar skipped as a failed scan, not a zero", async () => {
    const { scope, business } = await workspace({ placeId: null, websiteUrl: null });
    const started = await startScan(scope, { businessId: business.id });

    await drain(scanHandlers({ places: null }));

    const scan = await getScan(scope, started!.id);
    expect(scan?.status).toBe("failed");
    expect(scan?.score).toBeNull();
    const pillars = await latestPillarResults(scope, started!.id);
    expect(pillars.every((p) => p.status === "skipped")).toBe(true);
  });

  it("will not start a scan for a business in another workspace", async () => {
    const a = await workspace();
    const other = await createOrg({ name: "Agency B", slug: "agency-b" });
    expect(await startScan({ orgId: other.id }, { businessId: a.business.id })).toBeNull();
  });
});

describe("credits and caching", () => {
  it("charges for the grid once, then reuses the answer inside the window for free", async () => {
    const { scope, business } = await workspace();
    const ranks = { name: "counting", rankAt: vi.fn(async () => 1) };
    const handlers = scanHandlers({
      places: places(),
      probe: async () => PROBE,
      ranks,
      grid: { radiusKm: 2, size: 3 },
    });

    const first = await startScan(scope, { businessId: business.id });
    await drain(handlers);
    expect(ranks.rankAt).toHaveBeenCalledTimes(9);
    expect(await creditBalance(scope)).toBe(9);

    const second = await startScan(scope, { businessId: business.id });
    await drain(handlers);

    // Nobody paid a provider for the same question twice.
    expect(ranks.rankAt).toHaveBeenCalledTimes(9);
    expect(await creditBalance(scope)).toBe(9);

    const pillars = await latestPillarResults(scope, second!.id);
    const grid = pillars.find((p) => p.pillar === "geogrid");
    expect(grid?.status).toBe("ok");
    expect(grid?.detail).toMatch(/^Reused from a scan /);
    expect(grid?.score).toBe((await latestPillarResults(scope, first!.id)).find((p) => p.pillar === "geogrid")
      ?.score);
  });

  it("refuses the paid pillar when the balance cannot cover it, and still runs the free ones", async () => {
    const { scope, business } = await workspace({ credits: 0 });
    const ranks = { name: "counting", rankAt: vi.fn(async () => 1) };

    const started = await startScan(scope, { businessId: business.id });
    await drain(scanHandlers({ places: places(), probe: async () => PROBE, ranks }));

    const pillars = await latestPillarResults(scope, started!.id);
    const grid = pillars.find((p) => p.pillar === "geogrid");
    expect(grid?.status).toBe("skipped");
    expect(grid?.detail).toBe("Not enough scan credits: this needs 1 and the balance is 0");
    expect(ranks.rankAt).not.toHaveBeenCalled();

    // The scan still completes, scored out of the three pillars that ran.
    const scan = await getScan(scope, started!.id);
    expect(scan?.status).toBe("complete");
    expect(scan?.score).toBeGreaterThan(0);
  });

  it("gives the credit back when the grid could not be measured, without hiding the charge", async () => {
    const { scope, business } = await workspace();
    const ranks = {
      name: "broken",
      rankAt: async () => {
        throw new Error("rank provider is down");
      },
    };

    const started = await startScan(scope, { businessId: business.id });
    await drain(scanHandlers({ places: places(), probe: async () => PROBE, ranks, grid: { radiusKm: 2, size: 3 } }), 12);

    const grid = (await latestPillarResults(scope, started!.id)).find((p) => p.pillar === "geogrid");
    expect(grid?.status).toBe("failed");
    expect(grid?.detail).toBe("rank provider is down");

    expect(await creditBalance(scope)).toBe(10);
    const ledger = await listCreditEntries(scope);
    expect(ledger.map((e) => e.delta)).toEqual([1, -1, 10]);
    expect(ledger[0].reason).toMatch(/could not be measured/);
  });

  it("does not close a scan at dispatch while pillars are still outstanding", async () => {
    // The start job finalises defensively, in case every pillar was resolved before any
    // job was queued. It must not act while work is still coming.
    const { scope, business } = await workspace({ credits: 0 });
    const started = await startScan(scope, { businessId: business.id });

    await runOnce({ worker: "test", handlers: scanHandlers({ places: null }), batchSize: 10 });

    const scan = await getScan(scope, started!.id);
    expect(scan?.status).toBe("running");
    expect(scan?.finishedAt).toBeNull();
    // The refused pillar already has its answer; the other three are still queued.
    expect(await latestPillarResults(scope, started!.id)).toHaveLength(1);
  });
});
