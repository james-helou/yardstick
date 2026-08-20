import { callExternal, ExternalCallError, type CallOptions } from "@/lib/external/call";
import type { PlaceCandidate, PlacesProvider, PlacesSearch } from "./types";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const PROVIDER = "google-places";

/**
 * Ask for exactly the fields we map and nothing else. Places bills by field mask, so a
 * lazy `*` costs real money per call and hands us data we have no reason to hold.
 */
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.addressComponents",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.websiteUri",
  "places.internationalPhoneNumber",
].join(",");

const DEFAULT_LIMIT = 10;

export class PlacesRequestError extends ExternalCallError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(PROVIDER, message);
    this.name = "PlacesRequestError";
  }
}

type GoogleComponent = { longText?: string; shortText?: string; types?: string[] };

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  addressComponents?: GoogleComponent[];
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  websiteUri?: string;
  internationalPhoneNumber?: string;
};

function componentText(
  components: GoogleComponent[],
  type: string,
  prefer: "longText" | "shortText",
): string | undefined {
  const match = components.find((c) => c.types?.includes(type));
  const value = match?.[prefer] ?? match?.longText ?? match?.shortText;
  return value?.trim() || undefined;
}

/**
 * Google's response into our own shape. Exported because it is the part worth testing,
 * and the part that breaks when the vendor changes its JSON.
 */
export function toCandidate(place: GooglePlace): PlaceCandidate | null {
  const placeId = place.id?.trim();
  const name = place.displayName?.text?.trim();
  // Without an identifier we could never recognise this listing again, so an import
  // would silently duplicate it on the next scan. Drop it instead.
  if (!placeId || !name) return null;

  const components = place.addressComponents ?? [];
  const streetNumber = componentText(components, "street_number", "shortText");
  const route = componentText(components, "route", "shortText");
  const addressLine = [streetNumber, route].filter(Boolean).join(" ") || undefined;

  return {
    placeId,
    name,
    ...(addressLine ? { addressLine } : {}),
    ...maybe("locality", componentText(components, "locality", "longText")),
    ...maybe("region", componentText(components, "administrative_area_level_1", "shortText")),
    ...maybe("postalCode", componentText(components, "postal_code", "longText")),
    ...maybe("country", componentText(components, "country", "shortText")),
    ...maybe("latitude", place.location?.latitude),
    ...maybe("longitude", place.location?.longitude),
    ...maybe("primaryCategory", place.primaryTypeDisplayName?.text?.trim() || undefined),
    ...maybe("websiteUrl", place.websiteUri?.trim() || undefined),
    ...maybe("phone", place.internationalPhoneNumber?.trim() || undefined),
  };
}

function maybe<K extends string, V>(key: K, value: V | undefined): Partial<Record<K, V>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

/** A rejected key or a malformed query fails identically on a second attempt. */
function isRetryable(error: unknown): boolean {
  if (error instanceof PlacesRequestError) return error.status === 429 || error.status >= 500;
  return true;
}

export type GooglePlacesOptions = {
  apiKey: string;
  /** Injected so every test runs offline. */
  fetchImpl?: typeof fetch;
  call?: Partial<CallOptions>;
};

export function googlePlaces({ apiKey, fetchImpl = fetch, call }: GooglePlacesOptions): PlacesProvider {
  return {
    name: PROVIDER,
    async search({ query, near, limit = DEFAULT_LIMIT, signal }: PlacesSearch): Promise<PlaceCandidate[]> {
      const body: Record<string, unknown> = { textQuery: query, maxResultCount: limit };
      if (near) {
        body.locationBias = {
          circle: {
            center: { latitude: near.latitude, longitude: near.longitude },
            ...(near.radiusMeters === undefined ? {} : { radius: near.radiusMeters }),
          },
        };
      }

      const payload = await callExternal(
        async (innerSignal) => {
          const response = await fetchImpl(ENDPOINT, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Goog-Api-Key": apiKey,
              "X-Goog-FieldMask": FIELD_MASK,
            },
            body: JSON.stringify(body),
            signal: innerSignal,
          });

          if (!response.ok) {
            const detail = await response
              .json()
              .then((json: { error?: { message?: string } }) => json?.error?.message)
              .catch(() => undefined);
            throw new PlacesRequestError(
              response.status,
              `Places search failed with ${response.status}${detail ? `: ${detail}` : ""}`,
            );
          }
          return (await response.json()) as { places?: GooglePlace[] };
        },
        { name: PROVIDER, isRetryable, signal, ...call },
      );

      return (payload.places ?? []).map(toCandidate).filter((c): c is PlaceCandidate => c !== null);
    },
  };
}
