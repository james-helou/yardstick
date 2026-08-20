import { z } from "zod";

/**
 * One business as a places provider describes it, already normalised away from any one
 * vendor's JSON. Everything except the identifier and the name is optional, because a
 * real listing is often missing a website, a phone, or a tidy address.
 *
 * Declared as a schema rather than a bare type because a candidate makes a round trip
 * through the browser on its way to being imported, and anything that comes back from a
 * browser is input.
 */
export const placeCandidateSchema = z.object({
  /** The provider's stable identifier. Stored on the business so a re-import updates. */
  placeId: z.string().min(1).max(300),
  name: z.string().min(1).max(200),
  addressLine: z.string().max(300).optional(),
  locality: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  /** Two letters, in whatever case the provider used. Mapping normalises it. */
  country: z.string().max(2).optional(),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  primaryCategory: z.string().max(120).optional(),
  websiteUrl: z.string().max(500).optional(),
  phone: z.string().max(40).optional(),
});

export type PlaceCandidate = z.infer<typeof placeCandidateSchema>;

/** Reads a candidate back off the wire. Returns null rather than throwing at a boundary. */
export function parsePlaceCandidate(raw: unknown): PlaceCandidate | null {
  const parsed = placeCandidateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Everything the details lookup returns on top of a search result. Search is cheap and
 * shallow; details is the expensive call, so it is only made when a scan needs it.
 */
export type PlaceDetails = PlaceCandidate & {
  rating?: number;
  reviewCount?: number;
  /** Newest first, as the provider ordered them. */
  reviews?: PlaceReview[];
  /** One string per weekday, as the provider phrases it. */
  openingHours?: string[];
  description?: string;
  photoCount?: number;
  /** "OPERATIONAL", "CLOSED_TEMPORARILY", and friends. */
  businessStatus?: string;
  categories?: string[];
};

export type PlaceReview = {
  rating: number;
  publishedAt?: string;
  text?: string;
  authorName?: string;
};

export type PlacesSearch = {
  query: string;
  /** Bias results toward a point. A local search for "dentist" is meaningless without one. */
  near?: { latitude: number; longitude: number; radiusMeters?: number };
  limit?: number;
  signal?: AbortSignal;
};

/**
 * The seam. Everything upstream of a provider talks to this, so a second vendor or a
 * fixture in a test is a swap rather than a rewrite.
 */
export interface PlacesProvider {
  readonly name: string;
  search(input: PlacesSearch): Promise<PlaceCandidate[]>;
  /** Null when the listing has gone. A scan treats that as a finding, not an error. */
  details(placeId: string, options?: { signal?: AbortSignal }): Promise<PlaceDetails | null>;
}
