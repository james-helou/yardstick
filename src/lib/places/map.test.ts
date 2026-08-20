import { describe, expect, it } from "vitest";
import { parseBusinessInput } from "@/lib/businesses/schema";
import { placeToBusinessInput } from "./map";
import { parsePlaceCandidate, type PlaceCandidate } from "./types";

const CANDIDATE: PlaceCandidate = {
  placeId: "ChIJ_dental",
  name: "Bright Smile Dental",
  addressLine: "4200 Rue Sainte-Catherine O",
  locality: "Montreal",
  region: "Quebec",
  postalCode: "H3Z 1P2",
  country: "ca",
  latitude: 45.487,
  longitude: -73.596,
  primaryCategory: "Dentist",
  websiteUrl: "brightsmile.ca",
  phone: "+1 514-555-0100",
};

describe("placeToBusinessInput", () => {
  it("produces input the business validator accepts", () => {
    const result = parseBusinessInput(placeToBusinessInput(CANDIDATE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      name: "Bright Smile Dental",
      status: "prospect",
      locality: "Montreal",
      country: "CA",
      latitude: 45.487,
      placeId: "ChIJ_dental",
      websiteUrl: "https://brightsmile.ca",
    });
  });

  it("defaults to prospect but honours an explicit status", () => {
    expect(placeToBusinessInput(CANDIDATE).status).toBe("prospect");
    expect(placeToBusinessInput(CANDIDATE, { status: "client" }).status).toBe("client");
  });

  it("upper-cases the country code, because Places reports it either way", () => {
    expect(placeToBusinessInput(CANDIDATE).country).toBe("CA");
  });

  it("omits every field the place did not carry rather than sending empty strings", () => {
    const sparse = placeToBusinessInput({ placeId: "p1", name: "Corner Barber" });
    expect(sparse).toEqual({ name: "Corner Barber", status: "prospect", placeId: "p1" });
    expect(parseBusinessInput(sparse).ok).toBe(true);
  });

  it("keeps a place with an unusable website importable", () => {
    // Mapping never decides what is valid. It hands everything to the one validator,
    // which reports the bad field and leaves the rest intact.
    const result = parseBusinessInput(placeToBusinessInput({ ...CANDIDATE, websiteUrl: "not a url" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(Object.keys(result.errors)).toEqual(["websiteUrl"]);
  });
});

describe("parsePlaceCandidate", () => {
  it("accepts a candidate that made the round trip through the browser", () => {
    expect(parsePlaceCandidate(JSON.parse(JSON.stringify(CANDIDATE)))).toEqual(CANDIDATE);
  });

  it("refuses anything that is not one", () => {
    expect(parsePlaceCandidate({ name: "No identifier" })).toBeNull();
    expect(parsePlaceCandidate({ placeId: "p1", name: "Off the map", latitude: 900 })).toBeNull();
    expect(parsePlaceCandidate("[]")).toBeNull();
  });
});
