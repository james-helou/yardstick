import type { BusinessStatus } from "@/lib/businesses/schema";
import type { PlaceCandidate } from "./types";

/**
 * Turns a place into raw business input. Deliberately raw: it goes through
 * `parseBusinessInput` exactly like a typed form does, so an imported business and a
 * hand-entered one are held to the same rules and there is only ever one validator.
 *
 * A field the place did not carry is left out entirely rather than sent as an empty
 * string, so the column stays null.
 */
export function placeToBusinessInput(
  place: PlaceCandidate,
  options: { status?: BusinessStatus } = {},
): Record<string, string | number> {
  const input: Record<string, string | number> = {
    name: place.name,
    status: options.status ?? "prospect",
    placeId: place.placeId,
  };

  const put = (key: string, value: string | number | undefined) => {
    if (value === undefined) return;
    if (typeof value === "string" && value.trim() === "") return;
    input[key] = value;
  };

  put("addressLine", place.addressLine);
  put("locality", place.locality);
  put("region", place.region);
  put("postalCode", place.postalCode);
  put("country", place.country?.trim().toUpperCase());
  put("latitude", place.latitude);
  put("longitude", place.longitude);
  put("primaryCategory", place.primaryCategory);
  put("websiteUrl", place.websiteUrl);
  put("phone", place.phone);

  return input;
}
