import { getBusiness } from "@/lib/db/repos/businesses";
import {
  createScan,
  finalizeScan,
  getScan,
  markScanRunning,
  recordPillarResult,
} from "@/lib/db/repos/scans";
import type { OrgScope } from "@/lib/db/scope";
import { enqueue, type Job } from "@/lib/jobs/queue";
import type { JobHandlers } from "@/lib/jobs/worker";
import type { PlaceDetails, PlacesProvider } from "@/lib/places";
import { probeSite, type SiteProbe } from "@/lib/site/probe";
import { scoreGbpProfile } from "./gbp";
import { isPillar, PILLARS, type Pillar } from "./pillars";
import { scoreReputation } from "./reputation";
import type { PillarOutcome } from "./score";
import { scoreSiteHealth } from "./site-health";

export const SCAN_START = "scan.start";
export const SCAN_PILLAR = "scan.pillar";

export type ScanDeps = {
  /** Null when no Places key is configured. Two pillars then report themselves skipped. */
  places: PlacesProvider | null;
  probe?: (url: string) => Promise<SiteProbe>;
  now?: () => Date;
};

type Target = { placeId: string | null; websiteUrl: string | null };

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
export async function runPillar(
  pillar: Pillar,
  target: Target,
  deps: ScanDeps,
): Promise<PillarOutcome> {
  const probe = deps.probe ?? ((url: string) => probeSite(url));

  if (pillar === "gbp" || pillar === "reputation") {
    const details = await placeDetails(deps.places, target);
    if (details === "unavailable") return skipped(pillar, "Google Places is not configured yet");
    if (details === null && !target.placeId) {
      return skipped(pillar, "This business is not linked to a Google listing");
    }
    if (details === null) return skipped(pillar, "Google no longer returns this listing");

    return pillar === "gbp" ? scoreGbpProfile(details) : scoreReputation(details, deps.now?.() ?? new Date());
  }

  if (!target.websiteUrl) return skipped(pillar, "This business has no website on record");
  return scoreSiteHealth(await probe(target.websiteUrl));
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

      const scan = await getScan(scope, scanId);
      if (!scan) throw new Error(`Scan ${scanId} is gone`);

      await markScanRunning(scope, scanId);

      // One job per pillar, keyed so a retry of this job cannot double the work.
      for (const pillar of PILLARS) {
        await enqueue(scope, {
          kind: SCAN_PILLAR,
          payload: { scanId, pillar },
          idempotencyKey: `${SCAN_PILLAR}:${scanId}:${pillar}`,
        });
      }
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

      let outcome: PillarOutcome;
      try {
        outcome = await runPillar(
          pillar,
          { placeId: business.placeId, websiteUrl: business.websiteUrl },
          deps,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Retry while attempts remain, because most provider failures are weather.
        // On the last attempt, record the failure instead, so the scan can finish
        // rather than hanging on a pillar that will never report.
        if (job.attempts < job.maxAttempts) throw error;
        outcome = { pillar, status: "failed", findings: [], detail: message };
      }

      await recordPillarResult(scope, { scanId, outcome });
      await finalizeScan(scope, scanId);
    },
  };
}
