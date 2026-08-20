/**
 * Every pillar the product knows how to run. A scan records which of these it actually
 * dispatched, so growing this list cannot strand a scan that is already in flight.
 */
export const PILLARS = ["gbp", "reputation", "site_health", "geogrid", "ai_visibility"] as const;

export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABEL: Record<Pillar, string> = {
  gbp: "Google profile",
  reputation: "Reputation",
  site_health: "Site health",
  geogrid: "Local rank grid",
  ai_visibility: "AI visibility",
};

export const PILLAR_BLURB: Record<Pillar, string> = {
  gbp: "How complete the Google Business Profile is",
  reputation: "What reviews say, how many, and how recent",
  site_health: "Whether the site is reachable, indexable and fast",
  geogrid: "Where the business ranks across the neighbourhoods it serves",
  ai_visibility: "Whether AI assistants name this business when asked for a local recommendation",
};

/**
 * Weights sum to one. The Google profile leads because it is both the heaviest ranking
 * factor in local search and the cheapest thing an agency can fix in week one. The rank
 * grid is close behind because it is the only pillar that measures the outcome rather
 * than the inputs.
 *
 * AI visibility is deliberately the lightest. It is where the search is going and it
 * sells a meeting on its own, but today it still moves fewer phone calls than the map
 * pack does, and a score that overstated it would be a score an agency gets caught on.
 */
export const PILLAR_WEIGHT: Record<Pillar, number> = {
  gbp: 0.27,
  reputation: 0.22,
  site_health: 0.16,
  geogrid: 0.22,
  ai_visibility: 0.13,
};

/**
 * What a pillar costs to run, in credits. The cheap three are free: they are one HTTP
 * call each and they are what makes a free public audit possible. The grid is dozens of
 * paid queries, so it is metered.
 */
export const PILLAR_COST: Record<Pillar, number> = {
  gbp: 0,
  reputation: 0,
  site_health: 0,
  geogrid: 1,
  ai_visibility: 1,
};

/** How long a pillar's answer stays good enough to hand back without paying again. */
export const PILLAR_CACHE_MS: Record<Pillar, number> = {
  gbp: 0,
  reputation: 0,
  site_health: 0,
  geogrid: 7 * 24 * 60 * 60 * 1000,
  // Shorter than the grid: model updates and prompt-set changes move this answer faster
  // than a map pack moves, and a stale AI finding is the one a prospect will fact-check.
  ai_visibility: 3 * 24 * 60 * 60 * 1000,
};

export function isPillar(value: unknown): value is Pillar {
  return typeof value === "string" && (PILLARS as readonly string[]).includes(value);
}
