/** The three cheap pillars. Geogrid and AI visibility arrive in phases 3 and 4. */
export const PILLARS = ["gbp", "reputation", "site_health"] as const;

export type Pillar = (typeof PILLARS)[number];

export const PILLAR_LABEL: Record<Pillar, string> = {
  gbp: "Google profile",
  reputation: "Reputation",
  site_health: "Site health",
};

export const PILLAR_BLURB: Record<Pillar, string> = {
  gbp: "How complete the Google Business Profile is",
  reputation: "What reviews say, how many, and how recent",
  site_health: "Whether the site is reachable, indexable and fast",
};

/**
 * Weights sum to one. The Google profile leads because it is both the heaviest ranking
 * factor in local search and the cheapest thing an agency can fix in week one.
 */
export const PILLAR_WEIGHT: Record<Pillar, number> = {
  gbp: 0.4,
  reputation: 0.35,
  site_health: 0.25,
};

export function isPillar(value: unknown): value is Pillar {
  return typeof value === "string" && (PILLARS as readonly string[]).includes(value);
}
