import type { PlaceDetails } from "@/lib/places";
import { roundScore, type Finding, type PillarOutcome } from "./score";

const DAY_MS = 86_400_000;
const RECENT_DAYS = 90;
/** Enough reviews that the average means something. Past this, volume stops helping. */
const VOLUME_TARGET = 25;

/** 3.0 stars scores nothing, 5.0 scores full. Below 3 is already a crisis. */
function ratingComponent(rating: number | undefined): number {
  if (rating === undefined) return 0;
  return Math.min(1, Math.max(0, (rating - 3) / 2));
}

/** Logarithmic, because the tenth review matters far more than the hundredth. */
function volumeComponent(count: number | undefined): number {
  if (!count || count <= 0) return 0;
  return Math.min(1, Math.log10(count + 1) / Math.log10(VOLUME_TARGET + 1));
}

function daysSinceNewestReview(details: PlaceDetails, now: Date): number | null {
  const stamps = (details.reviews ?? [])
    .map((r) => (r.publishedAt ? Date.parse(r.publishedAt) : Number.NaN))
    .filter((t) => Number.isFinite(t));
  if (stamps.length === 0) return null;
  return Math.floor((now.getTime() - Math.max(...stamps)) / DAY_MS);
}

/**
 * Rating, volume and recency, in that order of weight. Recency is in here because a
 * five-star average from four years ago reads as a closed business, and that is exactly
 * the conversation an agency wants to be having.
 */
export function scoreReputation(details: PlaceDetails, now: Date = new Date()): PillarOutcome {
  const rating = details.rating;
  const count = details.reviewCount ?? details.reviews?.length ?? 0;
  const staleDays = daysSinceNewestReview(details, now);

  const findings: Finding[] = [
    {
      code: "rating",
      label: rating === undefined ? "No star rating yet" : `Rated ${rating.toFixed(1)} out of 5`,
      ok: (rating ?? 0) >= 4.2,
      weight: 3,
      detail: rating !== undefined && rating < 4.2 ? "Under 4.2 stars, buyers filter this listing out" : undefined,
    },
    {
      code: "volume",
      label: `${count} review${count === 1 ? "" : "s"}`,
      ok: count >= VOLUME_TARGET,
      weight: 2,
      detail: count < VOLUME_TARGET ? `Competitors in this category typically show ${VOLUME_TARGET} or more` : undefined,
    },
    {
      code: "recency",
      label: "A review in the last three months",
      ok: staleDays !== null && staleDays <= RECENT_DAYS,
      weight: 2,
      detail:
        staleDays === null
          ? "No dated reviews to judge from"
          : staleDays > RECENT_DAYS
            ? `Newest review is ${staleDays} days old`
            : undefined,
    },
  ];

  const recencyComponent = staleDays !== null && staleDays <= RECENT_DAYS ? 1 : 0;
  const score = roundScore(
    (0.6 * ratingComponent(rating) + 0.25 * volumeComponent(count) + 0.15 * recencyComponent) * 100,
  );

  return { pillar: "reputation", status: "ok", score, findings };
}
