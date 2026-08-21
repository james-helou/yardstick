import type { PlaceDetails } from "@/lib/places";
import { checklistScore, type Finding, type PillarOutcome } from "./score";

const has = (value: unknown): boolean =>
  typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;

/**
 * Profile completeness, which is the cheapest thing an agency can fix and the first
 * thing a prospect can verify for themselves while still on the call. Every check is
 * something a person can act on, phrased as the gap rather than the field name.
 */
export function scoreGbpProfile(details: PlaceDetails): PillarOutcome {
  const findings: Finding[] = [
    {
      code: "website",
      label: "Website linked from the profile",
      ok: has(details.websiteUrl),
      weight: 3,
      detail: has(details.websiteUrl) ? undefined : "No website on the listing, so every profile view is a dead end",
    },
    {
      code: "phone",
      label: "Phone number on the profile",
      ok: has(details.phone),
      weight: 2,
    },
    {
      code: "hours",
      label: "Opening hours published",
      ok: (details.openingHours?.length ?? 0) > 0,
      weight: 2,
      detail: (details.openingHours?.length ?? 0) > 0 ? undefined : "Google hides listings without hours from some searches",
    },
    {
      code: "category",
      label: "Primary category set",
      ok: has(details.primaryCategory),
      weight: 2,
    },
    {
      code: "address",
      label: "Full address on the profile",
      ok: has(details.addressLine) && has(details.locality),
      weight: 2,
    },
    // An absent photo array is not a claim of zero. Google withholds photos entirely on
    // our key, and "0 photos on the listing" is a false statement about a business that
    // has plenty, in a report the business is invited to check.
    details.photoCount === undefined
      ? {
          code: "photos",
          label: "At least three photos",
          ok: false,
          measured: false,
          weight: 1,
          detail: "Google did not return photos for this listing, so this is unjudged",
        }
      : {
          code: "photos",
          label: "At least three photos",
          ok: details.photoCount >= 3,
          weight: 1,
          detail:
            details.photoCount >= 3
              ? undefined
              : `${details.photoCount} photo${details.photoCount === 1 ? "" : "s"} on the listing`,
        },
    {
      code: "operational",
      label: "Listing marked open",
      ok: details.businessStatus === undefined || details.businessStatus === "OPERATIONAL",
      weight: 3,
      detail:
        details.businessStatus && details.businessStatus !== "OPERATIONAL"
          ? `Google shows this listing as ${details.businessStatus.toLowerCase().replace(/_/g, " ")}`
          : undefined,
    },
  ];

  return { pillar: "gbp", status: "ok", score: checklistScore(findings), findings };
}
