/**
 * Every pillar the product knows how to run. A scan records which of these it actually
 * dispatched, so growing this list cannot strand a scan that is already in flight.
 */
export const PILLARS = ["gbp", "reputation", "site_health", "geogrid"] as const;

export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABEL: Record<Pillar, string> = {
  gbp: "Google profile",
  reputation: "Reputation",
  site_health: "Site health",
  geogrid: "Local rank grid",
};

export const PILLAR_BLURB: Record<Pillar, string> = {
  gbp: "How complete the Google Business Profile is",
  reputation: "What reviews say, how many, and how recent",
  site_health: "Whether the site is reachable, indexable and fast",
  geogrid: "Where the business ranks across the neighbourhoods it serves",
};

/**
 * Weights sum to one. The Google profile leads because it is both the heaviest ranking
 * factor in local search and the cheapest thing an agency can fix in week one. The rank
 * grid is close behind because it is the only pillar that measures the outcome rather
 * than the inputs.
 */
export const PILLAR_WEIGHT: Record<Pillar, number> = {
  gbp: 0.3,
  reputation: 0.25,
  site_health: 0.2,
  geogrid: 0.25,
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
};

/** How long a pillar's answer stays good enough to hand back without paying again. */
export const PILLAR_CACHE_MS: Record<Pillar, number> = {
  gbp: 0,
  reputation: 0,
  site_health: 0,
  geogrid: 7 * 24 * 60 * 60 * 1000,
};

export function isPillar(value: unknown): value is Pillar {
  return typeof value === "string" && (PILLARS as readonly string[]).includes(value);
}
