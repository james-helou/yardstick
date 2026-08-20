import { env } from "@/lib/env";
import { googlePlaces } from "./google";
import type { PlacesProvider } from "./types";

export type { PlaceCandidate, PlacesProvider, PlacesSearch } from "./types";
export { parsePlaceCandidate, placeCandidateSchema } from "./types";
export { placeToBusinessInput } from "./map";

/**
 * The flag. Places costs money per call, so the feature stays off until a key exists.
 * Callers branch on null and fall back to manual entry, which always works.
 */
export function placesProvider(): PlacesProvider | null {
  const apiKey = env().GOOGLE_PLACES_API_KEY;
  return apiKey ? googlePlaces({ apiKey }) : null;
}
