import { roundScore, type Finding, type PillarOutcome } from "./score";

export type RankedPoint = { latitude: number; longitude: number; rank: number | null };

/** Past this, nobody is scrolling. A rank of 21 and no rank at all are the same sale. */
export const RANK_HORIZON = 20;

const share = (count: number, total: number) => (total === 0 ? 0 : count / total);
const percent = (value: number) => Math.round(value * 100);

/**
 * The only pillar that measures the outcome rather than the inputs: where the business
 * actually shows up, across the neighbourhoods it claims to serve.
 *
 * The score is average visibility per point, where first place is worth everything and
 * anything past the horizon is worth nothing. Averaging ranks instead would let one
 * strong point paper over a map that is blank everywhere else.
 */
export function scoreGeogrid(points: readonly RankedPoint[], keyword: string): PillarOutcome {
  if (points.length === 0) {
    return {
      pillar: "geogrid",
      status: "failed",
      findings: [],
      detail: "The grid came back with no points",
    };
  }

  const ranked = points.filter((p) => p.rank !== null) as { rank: number }[];
  const topThree = ranked.filter((p) => p.rank <= 3).length;
  const topTen = ranked.filter((p) => p.rank <= 10).length;
  const blank = points.length - ranked.length;

  const visibility =
    points.reduce((sum, p) => {
      if (p.rank === null || p.rank > RANK_HORIZON) return sum;
      return sum + (RANK_HORIZON + 1 - p.rank) / RANK_HORIZON;
    }, 0) / points.length;

  const averageRank =
    ranked.length === 0
      ? null
      : Math.round((ranked.reduce((sum, p) => sum + p.rank, 0) / ranked.length) * 10) / 10;

  const findings: Finding[] = [
    {
      code: "top3",
      label: `In the top 3 from ${percent(share(topThree, points.length))}% of the area`,
      ok: share(topThree, points.length) >= 0.5,
      weight: 3,
      detail:
        share(topThree, points.length) >= 0.5
          ? undefined
          : "The top 3 is the map pack, and almost every call comes from it",
    },
    {
      code: "top10",
      label: `In the top 10 from ${percent(share(topTen, points.length))}% of the area`,
      ok: share(topTen, points.length) >= 0.8,
      weight: 2,
    },
    {
      code: "blank",
      label: blank === 0 ? "Visible everywhere on the grid" : `Invisible from ${blank} of ${points.length} points`,
      ok: blank === 0,
      weight: 3,
      detail: blank === 0 ? undefined : `Searching "${keyword}" from those points does not find this business at all`,
    },
    {
      code: "average",
      label: averageRank === null ? "No ranking positions found" : `Average position ${averageRank}`,
      ok: averageRank !== null && averageRank <= 5,
      weight: 2,
    },
  ];

  return { pillar: "geogrid", status: "ok", score: roundScore(visibility * 100), findings };
}
