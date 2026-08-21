import { describe, expect, it } from "vitest";
import type { PlaceDetails } from "@/lib/places";
import { scoreGbpProfile } from "./gbp";
import type { SiteProbe } from "@/lib/site/probe";
import { scoreReputation } from "./reputation";
import { scoreSiteHealth } from "./site-health";

const COMPLETE: PlaceDetails = {
  placeId: "p1",
  name: "Bright Smile Dental",
  addressLine: "4200 Rue Sainte-Catherine O",
  locality: "Montreal",
  primaryCategory: "Dentist",
  websiteUrl: "https://brightsmile.ca",
  phone: "+1 514-555-0100",
  openingHours: ["Monday: 9 to 5"],
  description: "A dental clinic",
  photoCount: 8,
  businessStatus: "OPERATIONAL",
};

const NOW = new Date("2026-08-20T00:00:00Z");

describe("scoreGbpProfile", () => {
  it("gives a complete profile full marks", () => {
    const outcome = scoreGbpProfile(COMPLETE);
    expect(outcome.score).toBe(100);
    expect(outcome.findings.every((f) => f.ok)).toBe(true);
  });

  it("charges the most for a missing website", () => {
    const outcome = scoreGbpProfile({ ...COMPLETE, websiteUrl: undefined });
    const website = outcome.findings.find((f) => f.code === "website");
    expect(website?.ok).toBe(false);
    expect(website?.detail).toContain("dead end");
    expect(outcome.score).toBeLessThan(90);
  });

  it("does not claim zero photos when Google withheld the field", () => {
    const withheld: PlaceDetails = { ...COMPLETE };
    delete withheld.photoCount;
    const outcome = scoreGbpProfile(withheld);
    const photos = outcome.findings.find((f) => f.code === "photos");

    // Google returns no photo array at all on our key, and an absent field is not the
    // same claim as an empty one. "0 photos on the listing" was a false statement about
    // a business that has plenty.
    expect(photos?.measured).toBe(false);
    expect(photos?.detail).not.toContain("0 photos");
    expect(outcome.score).toBe(100);
  });

  it("still counts photos when the provider actually sent some", () => {
    const outcome = scoreGbpProfile({ ...COMPLETE, photoCount: 1 });
    const photos = outcome.findings.find((f) => f.code === "photos");

    expect(photos?.ok).toBe(false);
    expect(photos?.measured).not.toBe(false);
    expect(photos?.detail).toBe("1 photo on the listing");
  });

  it("treats a listing Google marks closed as the finding it is", () => {
    const outcome = scoreGbpProfile({ ...COMPLETE, businessStatus: "CLOSED_TEMPORARILY" });
    const finding = outcome.findings.find((f) => f.code === "operational");
    expect(finding?.ok).toBe(false);
    expect(finding?.detail).toContain("closed temporarily");
  });

  it("does not punish a provider that simply did not report a status", () => {
    expect(scoreGbpProfile({ ...COMPLETE, businessStatus: undefined }).score).toBe(100);
  });

  it("scores an empty profile near nothing without throwing", () => {
    const outcome = scoreGbpProfile({ placeId: "p2", name: "Corner Barber" });
    // Three points of fifteen. Only "listing marked open" passes, and it passes on the
    // absence of a closed flag rather than on evidence. Fifteen and not sixteen because
    // photos cannot be judged when the provider sent no photo array at all.
    expect(outcome.score).toBe(20);
    expect(outcome.status).toBe("ok");
  });
});

describe("scoreReputation", () => {
  it("rewards a strong, busy, recent profile", () => {
    const outcome = scoreReputation(
      {
        ...COMPLETE,
        rating: 4.8,
        reviewCount: 140,
        reviews: [{ rating: 5, publishedAt: "2026-08-01T00:00:00Z" }],
      },
      NOW,
    );
    expect(outcome.score).toBeGreaterThan(85);
  });

  it("marks a good rating that has gone quiet", () => {
    const outcome = scoreReputation(
      {
        ...COMPLETE,
        rating: 4.9,
        reviewCount: 40,
        reviews: [{ rating: 5, publishedAt: "2022-01-01T00:00:00Z" }],
      },
      NOW,
    );
    const recency = outcome.findings.find((f) => f.code === "recency");
    expect(recency?.ok).toBe(false);
    expect(recency?.detail).toMatch(/days old/);
    expect(outcome.score).toBeLessThan(90);
  });

  it("scores a business with no reviews at zero, which is a real diagnosis", () => {
    const outcome = scoreReputation(COMPLETE, NOW);
    expect(outcome.score).toBe(0);
    expect(outcome.status).toBe("ok");
    expect(outcome.findings.find((f) => f.code === "rating")?.label).toBe("No star rating yet");
  });

  it("treats three stars as scoring nothing on rating", () => {
    const low = scoreReputation({ ...COMPLETE, rating: 3, reviewCount: 25 }, NOW);
    const high = scoreReputation({ ...COMPLETE, rating: 5, reviewCount: 25 }, NOW);
    expect(low.score).toBeLessThan(high.score!);
    expect(low.findings.find((f) => f.code === "rating")?.ok).toBe(false);
  });

  it("does not blame a business for review dates Google never sent", () => {
    const busy = { ...COMPLETE, rating: 4.8, reviewCount: 140 };
    const dated = scoreReputation({ ...busy, reviews: [{ rating: 5, publishedAt: "2026-08-01T00:00:00Z" }] }, NOW);
    const undated = scoreReputation(busy, NOW);

    const recency = undated.findings.find((f) => f.code === "recency");
    expect(recency?.measured).toBe(false);
    expect(recency?.detail).toContain("did not return");
    // Renormalised over what was measured, so within a point of the same business with a
    // fresh review rather than the fifteen points below it that a silent zero cost.
    expect(undated.score!).toBeGreaterThanOrEqual(dated.score! - 2);
  });

  it("still fails recency when the business genuinely has no reviews", () => {
    const outcome = scoreReputation(COMPLETE, NOW);
    const recency = outcome.findings.find((f) => f.code === "recency");

    // Nothing was withheld here. No reviews at all is a real diagnosis and scores as one.
    expect(recency?.ok).toBe(false);
    expect(recency?.measured).not.toBe(false);
    expect(outcome.score).toBe(0);
  });

  it("counts reviews it was handed when the provider gave no total", () => {
    const outcome = scoreReputation(
      { ...COMPLETE, rating: 4.5, reviews: [{ rating: 5 }, { rating: 4 }] },
      NOW,
    );
    expect(outcome.findings.find((f) => f.code === "volume")?.label).toBe("2 reviews");
  });
});

const HEALTHY: SiteProbe = {
  requestedUrl: "https://brightsmile.ca",
  finalUrl: "https://brightsmile.ca/",
  status: 200,
  https: true,
  responseMs: 400,
  htmlBytes: 42_000,
  title: "Bright Smile Dental, Montreal",
  metaDescription: "A dental clinic in downtown Montreal offering implants, whitening and family care.",
  h1Count: 1,
  hasViewport: true,
  hasCanonical: true,
  noindex: false,
  structuredDataTypes: ["Dentist"],
};

describe("scoreSiteHealth", () => {
  it("gives a well-built page full marks", () => {
    expect(scoreSiteHealth(HEALTHY).score).toBe(100);
  });

  it("scores a site that answers an error, rather than refusing to score it", () => {
    const outcome = scoreSiteHealth({ ...HEALTHY, status: 503 });
    expect(outcome.status).toBe("ok");
    expect(outcome.findings.find((f) => f.code === "reachable")?.detail).toBe("The site answered 503");
    expect(outcome.score).toBeLessThan(85);
  });

  it("flags a page that tells Google to stay away", () => {
    const outcome = scoreSiteHealth({ ...HEALTHY, noindex: true });
    expect(outcome.findings.find((f) => f.code === "indexable")?.ok).toBe(false);
  });

  it("says why a title fails rather than only that it did", () => {
    const long = scoreSiteHealth({ ...HEALTHY, title: "x".repeat(90) });
    expect(long.findings.find((f) => f.code === "title")?.detail).toContain("90 characters");
    const missing = scoreSiteHealth({ ...HEALTHY, title: undefined });
    expect(missing.findings.find((f) => f.code === "title")?.detail).toBe("No title tag at all");
  });

  it("counts more than one h1 as a fault", () => {
    expect(scoreSiteHealth({ ...HEALTHY, h1Count: 3 }).findings.find((f) => f.code === "h1")?.detail).toBe(
      "3 h1 headings",
    );
  });

  it("accepts any local-business flavour of structured data", () => {
    for (const type of ["LocalBusiness", "Dentist", "Restaurant", "ProfessionalService"]) {
      expect(scoreSiteHealth({ ...HEALTHY, structuredDataTypes: [type] }).score).toBe(100);
    }
    expect(scoreSiteHealth({ ...HEALTHY, structuredDataTypes: ["WebSite"] }).score).toBeLessThan(100);
  });

  it("calls out a slow response in seconds", () => {
    const outcome = scoreSiteHealth({ ...HEALTHY, responseMs: 3200 });
    expect(outcome.findings.find((f) => f.code === "speed")?.detail).toBe("Took 3.2s to answer");
  });
});
