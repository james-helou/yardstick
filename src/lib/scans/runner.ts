import type { Business } from "@/lib/db/repos/businesses";
import { getBusiness } from "@/lib/db/repos/businesses";
import { refundCredits, spendCredits } from "@/lib/db/repos/credits";
import { recordGridPoints, type GridPointInput } from "@/lib/db/repos/grid";
import {
  cachedPillarResult,
  createScan,
  finalizeScan,
  getScan,
  markScanRunning,
  recordPillarResult,
  setExpectedPillars,
} from "@/lib/db/repos/scans";
import type { OrgScope } from "@/lib/db/scope";
import { buildGrid, DEFAULT_GRID } from "@/lib/geogrid/grid";
import { enqueue, type Job } from "@/lib/jobs/queue";
import type { JobHandlers } from "@/lib/jobs/worker";
import type { PlaceDetails, PlacesProvider } from "@/lib/places";
import type { RankProvider } from "@/lib/rank";
import { probeSite, type SiteProbe } from "@/lib/site/probe";
import { scoreGbpProfile } from "./gbp";
import { scoreGeogrid } from "./geogrid";
import { isPillar, PILLAR_CACHE_MS, PILLAR_COST, PILLAR_LABEL, PILLARS, type Pillar } from "./pillars";
import { scoreReputation } from "./reputation";
import type { PillarOutcome } from "./score";
import { scoreSiteHealth } from "./site-health";

export const SCAN_START = "scan.start";
export const SCAN_PILLAR = "scan.pillar";

export type ScanDeps = {
  /** Null when no Places key is configured. Two pillars then report themselves skipped. */
  places: PlacesProvider | null;
  /** Null without rank credentials. The grid then reports itself unmeasured. */
  ranks?: RankProvider | null;
  probe?: (url: string) => Promise<SiteProbe>;
  now?: () => Date;
  grid?: { radiusKm: number; size: number };
  /** Rank lookups run in parallel, but politely: a grid is dozens of paid calls. */
  gridConcurrency?: number;
};

type Target = Pick<
  Business,
  "id" | "name" | "placeId" | "websiteUrl" | "latitude" | "longitude" | "primaryCategory"
>;

/** A pillar's answer, plus anything it wants stored alongside the score. */
export type PillarRun = { outcome: PillarOutcome; gridPoints?: GridPointInput[] };

export const targetOf = (business: Business): Target => ({
  id: business.id,
  name: business.name,
  placeId: business.placeId,
  websiteUrl: business.websiteUrl,
  latitude: business.latitude,
  longitude: business.longitude,
  primaryCategory: business.primaryCategory,
});

/** Runs `fn` over the items, at most `limit` at a time, preserving order. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

const skipped = (pillar: Pillar, detail: string): PillarOutcome => ({
  pillar,
  status: "skipped",
  findings: [],
  detail,
});

async function placeDetails(
  places: PlacesProvider | null,
  target: Target,
): Promise<PlaceDetails | null | "unavailable"> {
  if (!places) return "unavailable";
  if (!target.placeId) return null;
  return places.details(target.placeId);
}

/**
 * One pillar, start to finish. Providers are injected, so every branch here is testable
 * without a key and without the network.
 */
export async function runPillar(pillar: Pillar, target: Target, deps: ScanDeps): Promise<PillarRun> {
  const probe = deps.probe ?? ((url: string) => probeSite(url));

  if (pillar === "gbp" || pillar === "reputation") {
    const details = await placeDetails(deps.places, target);
    if (details === "unavailable") return { outcome: skipped(pillar, "Google Places is not configured yet") };
    if (details === null && !target.placeId) {
      return { outcome: skipped(pillar, "This business is not linked to a Google listing") };
    }
    if (details === null) return { outcome: skipped(pillar, "Google no longer returns this listing") };

    return {
      outcome:
        pillar === "gbp" ? scoreGbpProfile(details) : scoreReputation(details, deps.now?.() ?? new Date()),
    };
  }

  if (pillar === "site_health") {
    if (!target.websiteUrl) return { outcome: skipped(pillar, "This business has no website on record") };
    return { outcome: scoreSiteHealth(await probe(target.websiteUrl)) };
  }

  return runGeogrid(target, deps);
}

async function runGeogrid(target: Target, deps: ScanDeps): Promise<PillarRun> {
  if (!deps.ranks) return { outcome: skipped("geogrid", "Rank data is not configured yet") };
  if (target.latitude === null || target.longitude === null) {
    return { outcome: skipped("geogrid", "This business has no coordinates, so there is nowhere to search from") };
  }
  const keyword = target.primaryCategory?.trim();
  if (!keyword) {
    return { outcome: skipped("geogrid", "Set a primary category to use as the search term") };
  }

  const spec = deps.grid ?? DEFAULT_GRID;
  const points = buildGrid({
    center: { latitude: target.latitude, longitude: target.longitude },
    ...spec,
  });

  const ranks = await mapWithConcurrency(points, deps.gridConcurrency ?? 4, (point) =>
    deps.ranks!.rankAt({
      keyword,
      latitude: point.latitude,
      longitude: point.longitude,
      placeId: target.placeId,
      name: target.name,
    }),
  );

  const ranked = points.map((point, i) => ({
    keyword,
    latitude: point.latitude,
    longitude: point.longitude,
    rank: ranks[i],
  }));

  return { outcome: scoreGeogrid(ranked, keyword), gridPoints: ranked };
}

/**
 * Starts a scan: one row, then one job. The job is enqueued under the scan's own id, so
 * a retried request cannot fan out a second set of pillars.
 */
export async function startScan(
  scope: OrgScope,
  input: { businessId: string; requestedBy?: string | null },
): Promise<{ id: string } | null> {
  const scan = await createScan(scope, input);
  if (!scan) return null;

  await enqueue(scope, {
    kind: SCAN_START,
    payload: { scanId: scan.id },
    idempotencyKey: `${SCAN_START}:${scan.id}`,
  });

  return { id: scan.id };
}

const HOUR_MS = 3_600_000;

/** "4 hours ago", "2 days ago". The report says when, not just that it was reused. */
export function describeAge(ms: number): string {
  const hours = Math.max(0, Math.round(ms / HOUR_MS));
  if (hours < 1) return "in the last hour";
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function payloadString(job: Job, key: string): string {
  const value = job.payload[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Job ${job.id} is missing "${key}"`);
  }
  return value;
}

export function scanHandlers(deps: ScanDeps): JobHandlers {
  return {
    [SCAN_START]: async (job) => {
      const scope: OrgScope = { orgId: job.orgId };
      const scanId = payloadString(job, "scanId");
      const now = deps.now?.() ?? new Date();

      const scan = await getScan(scope, scanId);
      if (!scan) throw new Error(`Scan ${scanId} is gone`);

      await markScanRunning(scope, scanId);
      // Record what this scan is waiting on before dispatching any of it, so a pillar
      // that finishes immediately cannot finalise against an empty expectation.
      await setExpectedPillars(scope, scanId, PILLARS);

      for (const pillar of PILLARS) {
        const cached = await cachedPillarResult(scope, {
          businessId: scan.businessId,
          pillar,
          withinMs: PILLAR_CACHE_MS[pillar],
        });

        // A recent answer is handed straight back. This is what makes a re-run inside
        // the window free: nobody pays a provider twice for the same question.
        if (cached) {
          await recordPillarResult(scope, {
            scanId,
            outcome: {
              pillar,
              status: cached.status,
              ...(cached.score === null ? {} : { score: cached.score }),
              findings: cached.findings,
              detail: `Reused from a scan ${describeAge(now.getTime() - cached.createdAt.getTime())}`,
            },
          });
          continue;
        }

        const cost = PILLAR_COST[pillar];
        if (cost > 0) {
          const spend = await spendCredits(scope, {
            amount: cost,
            reason: `${PILLAR_LABEL[pillar]} scan`,
            scanId,
            idempotencyKey: `${scanId}:${pillar}`,
          });
          if (!spend.ok) {
            await recordPillarResult(scope, {
              scanId,
              outcome: skipped(
                pillar,
                `Not enough scan credits: this needs ${cost} and the balance is ${spend.balance}`,
              ),
            });
            continue;
          }
        }

        // One job per pillar, keyed so a retry of this job cannot double the work.
        await enqueue(scope, {
          kind: SCAN_PILLAR,
          payload: { scanId, pillar },
          idempotencyKey: `${SCAN_PILLAR}:${scanId}:${pillar}`,
        });
      }

      // Everything may have come from cache or been refused, in which case no pillar job
      // will ever run and nobody else is left to close the scan.
      await finalizeScan(scope, scanId);
    },

    [SCAN_PILLAR]: async (job) => {
      const scope: OrgScope = { orgId: job.orgId };
      const scanId = payloadString(job, "scanId");
      const pillar = payloadString(job, "pillar");
      if (!isPillar(pillar)) throw new Error(`Unknown pillar "${pillar}"`);

      const scan = await getScan(scope, scanId);
      if (!scan) throw new Error(`Scan ${scanId} is gone`);
      const business = await getBusiness(scope, scan.businessId);
      if (!business) throw new Error(`Business ${scan.businessId} is gone`);

      let run: PillarRun;
      try {
        run = await runPillar(pillar, targetOf(business), deps);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Retry while attempts remain, because most provider failures are weather.
        // On the last attempt, record the failure instead, so the scan can finish
        // rather than hanging on a pillar that will never report.
        if (job.attempts < job.maxAttempts) throw error;
        run = { outcome: { pillar, status: "failed", findings: [], detail: message } };
      }

      if (run.gridPoints?.length) {
        await recordGridPoints(scope, scanId, run.gridPoints);
      }

      // A pillar that was paid for and could not deliver gives the credit back. The
      // charge stays in the ledger next to the refund, so the failure is still visible.
      if (PILLAR_COST[pillar] > 0 && run.outcome.status !== "ok") {
        await refundCredits(scope, {
          amount: PILLAR_COST[pillar],
          reason: `${PILLAR_LABEL[pillar]} could not be measured`,
          scanId,
          idempotencyKey: `${scanId}:${pillar}:refund`,
        });
      }

      await recordPillarResult(scope, { scanId, outcome: run.outcome });
      await finalizeScan(scope, scanId);
    },
  };
}
