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
 *
 * Recency has three states rather than two, which is the whole subtlety of this pillar.
 * A business with no reviews has genuinely failed it. A business whose reviews exist but
 * whose dates the provider withheld has failed nothing, and scoring that as a zero
 * understates it by the full weight of the component while putting a red finding in a
 * report that is about our data rather than about the business. Google is currently
 * withholding review text on our key, so this is the live case, not a hypothetical.
 */
export function scoreReputation(details: PlaceDetails, now: Date = new Date()): PillarOutcome {
  const rating = details.rating;
  const count = details.reviewCount ?? details.reviews?.length ?? 0;
  const staleDays = daysSinceNewestReview(details, now);
  /** Reviews exist, but we were handed no date to judge them by. */
  const recencyUnknown = count > 0 && staleDays === null;

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
    recencyUnknown
      ? {
          code: "recency",
          label: "A review in the last three months",
          ok: false,
          measured: false,
          weight: 2,
          detail: "Google did not return review dates for this listing, so this is unjudged",
        }
      : {
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

  // Renormalised over what was actually measured, the way `overallScore` renormalises
  // over the pillars that actually ran.
  const components = [
    { weight: 0.6, value: ratingComponent(rating) },
    { weight: 0.25, value: volumeComponent(count) },
    ...(recencyUnknown
      ? []
      : [{ weight: 0.15, value: staleDays !== null && staleDays <= RECENT_DAYS ? 1 : 0 }]),
  ];
  const measuredWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const earned = components.reduce((sum, c) => sum + c.weight * c.value, 0);

  return { pillar: "reputation", status: "ok", score: roundScore((earned / measuredWeight) * 100), findings };
}
