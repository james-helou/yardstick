import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import { getScan, latestPillarResults } from "@/lib/db/repos/scans";
import { claimJobs } from "@/lib/jobs/queue";
import { runOnce } from "@/lib/jobs/worker";
import type { PlaceDetails, PlacesProvider } from "@/lib/places";
import type { SiteProbe } from "@/lib/site/probe";
import { resetTables } from "@/test/db";
import { runPillar, scanHandlers, SCAN_PILLAR, SCAN_START, startScan } from "./runner";

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

async function workspace(options: { placeId?: string | null; websiteUrl?: string | null } = {}) {
  const org = await createOrg({ name: "Agency A", slug: "agency-a" });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, {
    name: "Bright Smile Dental",
    status: "prospect",
    ...(options.placeId === null ? {} : { placeId: options.placeId ?? "p1" }),
    ...(options.websiteUrl === null ? {} : { websiteUrl: options.websiteUrl ?? "https://brightsmile.ca" }),
  });
  return { scope, business };
}

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
    const target = { placeId: "p1", websiteUrl: null };
    const gbp = await runPillar("gbp", target, { places: places() });
    const reputation = await runPillar("reputation", target, { places: places() });

    expect(gbp.score).toBe(100);
    expect(reputation.score).toBeGreaterThan(85);
  });

  it("reports itself skipped, with a reason, when Places is not configured", async () => {
    const outcome = await runPillar("gbp", { placeId: "p1", websiteUrl: null }, { places: null });
    expect(outcome).toMatchObject({ status: "skipped", detail: "Google Places is not configured yet" });
  });

  it("distinguishes an unlinked business from a listing that has gone", async () => {
    const unlinked = await runPillar("reputation", { placeId: null, websiteUrl: null }, { places: places() });
    expect(unlinked.detail).toBe("This business is not linked to a Google listing");

    const gone = await runPillar("reputation", { placeId: "p1", websiteUrl: null }, { places: places(null) });
    expect(gone.detail).toBe("Google no longer returns this listing");
  });

  it("skips site health when there is no website to look at", async () => {
    const outcome = await runPillar("site_health", { placeId: null, websiteUrl: null }, { places: null });
    expect(outcome).toMatchObject({ status: "skipped", detail: "This business has no website on record" });
  });

  it("scores site health from the probe", async () => {
    const outcome = await runPillar(
      "site_health",
      { placeId: null, websiteUrl: "https://brightsmile.ca" },
      { places: null, probe: async () => PROBE },
    );
    expect(outcome.score).toBe(100);
  });
});

describe("the scan pipeline", () => {
  it("runs end to end and scores the business", async () => {
    const { scope, business } = await workspace();
    const started = await startScan(scope, { businessId: business.id });
    expect(started).not.toBeNull();

    await drain(scanHandlers({ places: places(), probe: async () => PROBE }));

    const scan = await getScan(scope, started!.id);
    expect(scan?.status).toBe("complete");
    expect(scan?.score).toBeGreaterThan(90);
    expect(scan?.startedAt).toBeInstanceOf(Date);
    expect(scan?.finishedAt).toBeInstanceOf(Date);

    const pillars = await latestPillarResults(scope, started!.id);
    expect(pillars.map((p) => p.pillar).sort()).toEqual(["gbp", "reputation", "site_health"]);
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
    expect(queued.filter((j) => j.kind === SCAN_PILLAR)).toHaveLength(3);
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
