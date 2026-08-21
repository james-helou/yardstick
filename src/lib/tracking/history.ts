import { pillarScoresFor, scoreHistory } from "@/lib/db/repos/scans";
import type { OrgScope } from "@/lib/db/scope";
import { trendOf, type Trend } from "./trend";

/**
 * The trend for one business, assembled: the finished measurements, the per-pillar scores
 * at each end, and the pure comparison between them.
 */

export type HistoryDeps = {
  history?: typeof scoreHistory;
  pillars?: typeof pillarScoresFor;
  /** The day this became a client relationship. Everything before it is dropped. */
  since?: Date | null;
  limit?: number;
};

export async function trendFor(
  scope: OrgScope,
  businessId: string,
  deps: HistoryDeps = {},
): Promise<Trend> {
  const all = await (deps.history ?? scoreHistory)(scope, businessId, { limit: deps.limit ?? 24 });
  // Filter here as well as in trendOf, so the pillars read are the ends of the window the
  // client is actually shown rather than the ends of everything ever measured.
  const since = deps.since ?? null;
  const points = since ? all.filter((p) => p.at.getTime() >= since.getTime()) : all;
  if (points.length === 0) return trendOf([], new Map(), { since });

  // Only the two ends are compared, so only the two ends need their pillars read.
  const ends = [points[0].scanId, points[points.length - 1].scanId];
  const pillars = await (deps.pillars ?? pillarScoresFor)(scope, [...new Set(ends)]);

  return trendOf(points, pillars, { since });
}
