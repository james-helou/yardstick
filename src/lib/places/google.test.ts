import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetBreakers } from "@/lib/external/call";
import { googlePlaces, PlacesRequestError } from "./google";

const RESPONSE = {
  places: [
    {
      id: "ChIJ_dental",
      displayName: { text: "Bright Smile Dental" },
      formattedAddress: "4200 Rue Sainte-Catherine O, Montreal, QC H3Z 1P2, Canada",
      addressComponents: [
        { longText: "4200", shortText: "4200", types: ["street_number"] },
        { longText: "Rue Sainte-Catherine Ouest", shortText: "Rue Sainte-Catherine O", types: ["route"] },
        { longText: "Montreal", shortText: "Montreal", types: ["locality", "political"] },
        { longText: "Quebec", shortText: "QC", types: ["administrative_area_level_1"] },
        { longText: "Canada", shortText: "CA", types: ["country"] },
        { longText: "H3Z 1P2", shortText: "H3Z 1P2", types: ["postal_code"] },
      ],
      location: { latitude: 45.487, longitude: -73.596 },
      primaryTypeDisplayName: { text: "Dentist" },
      websiteUri: "https://brightsmile.ca",
      internationalPhoneNumber: "+1 514-555-0100",
    },
  ],
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const fast = { retries: 1, baseDelayMs: 0, jitter: false };

beforeEach(() => resetBreakers());

describe("googlePlaces", () => {
  it("maps a text search into candidates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(RESPONSE));
    const provider = googlePlaces({ apiKey: "k", fetchImpl, call: fast });

    const results = await provider.search({ query: "dentist montreal" });

    expect(results).toEqual([
      {
        placeId: "ChIJ_dental",
        name: "Bright Smile Dental",
        addressLine: "4200 Rue Sainte-Catherine O",
        locality: "Montreal",
        region: "QC",
        postalCode: "H3Z 1P2",
        country: "CA",
        latitude: 45.487,
        longitude: -73.596,
        primaryCategory: "Dentist",
        websiteUrl: "https://brightsmile.ca",
        phone: "+1 514-555-0100",
      },
    ]);
  });

  it("sends the key in a header and asks only for the fields it maps", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(RESPONSE));
    await googlePlaces({ apiKey: "secret-key", fetchImpl, call: fast }).search({
      query: "dentist",
      near: { latitude: 45.5, longitude: -73.5, radiusMeters: 5000 },
      limit: 5,
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://places.googleapis.com/v1/places:searchText");
    expect(init.method).toBe("POST");
    // A key belongs in a header. In a query string it lands in logs and referrers.
    expect(init.headers["X-Goog-Api-Key"]).toBe("secret-key");
    expect(url).not.toContain("secret-key");
    expect(init.headers["X-Goog-FieldMask"]).toContain("places.id");
    expect(init.headers["X-Goog-FieldMask"]).not.toContain("places.reviews");
    expect(JSON.parse(init.body)).toEqual({
      textQuery: "dentist",
      maxResultCount: 5,
      locationBias: { circle: { center: { latitude: 45.5, longitude: -73.5 }, radius: 5000 } },
    });
  });

  it("returns nothing when the area has no matches", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}));
    const results = await googlePlaces({ apiKey: "k", fetchImpl, call: fast }).search({ query: "nowhere" });
    expect(results).toEqual([]);
  });

  it("does not retry a rejected key, because a second call fails the same way", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "API key not valid" } }, 403));
    const provider = googlePlaces({ apiKey: "bad", fetchImpl, call: fast });

    await expect(provider.search({ query: "dentist" })).rejects.toBeInstanceOf(PlacesRequestError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries a 5xx and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { message: "backend error" } }, 503))
      .mockResolvedValueOnce(jsonResponse(RESPONSE));
    const provider = googlePlaces({ apiKey: "k", fetchImpl, call: fast });

    const results = await provider.search({ query: "dentist" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(1);
  });

  it("skips a place with no identifier rather than importing a business it cannot match again", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ places: [{ displayName: { text: "Nameless" } }, RESPONSE.places[0]] }),
    );
    const results = await googlePlaces({ apiKey: "k", fetchImpl, call: fast }).search({ query: "x" });
    expect(results).toHaveLength(1);
  });
});
