import { describe, expect, it } from "vitest";
import { band, checklistScore, overallScore, roundScore, topOpportunities, type PillarOutcome } from "./score";

const ok = (pillar: PillarOutcome["pillar"], score: number): PillarOutcome => ({
  pillar,
  status: "ok",
  score,
  findings: [],
});

describe("overallScore", () => {
  it("weights the pillars that ran", () => {
    // Only three pillars ran, so they are renormalised over their own weights:
    // (0.27 * 90 + 0.22 * 60 + 0.16 * 40) / 0.65 = 67.5
    const result = overallScore([ok("gbp", 90), ok("reputation", 60), ok("site_health", 40)]);
    expect(result.score).toBe(68);
    expect(result.unmeasured).toEqual([]);
  });

  it("renormalises when a provider was not configured", () => {
    // Only gbp and site_health ran, so the score is out of their weights alone,
    // not out of one that includes a pillar nobody measured.
    const result = overallScore([
      ok("gbp", 90),
      { pillar: "reputation", status: "skipped", findings: [], detail: "not configured" },
      ok("site_health", 40),
    ]);
    expect(result.score).toBe(71); // (0.27*90 + 0.16*40) / 0.43 = 71.4
    expect(result.measured).toEqual(["gbp", "site_health"]);
    expect(result.unmeasured).toEqual(["reputation"]);
  });

  it("scores nothing when nothing was measured, rather than zero", () => {
    const result = overallScore([{ pillar: "gbp", status: "failed", findings: [] }]);
    expect(result.score).toBeNull();
  });

  it("ignores a pillar that reports ok without a number", () => {
    expect(overallScore([{ pillar: "gbp", status: "ok", findings: [] }]).score).toBeNull();
  });
});

describe("checklistScore", () => {
  it("is the share of weight earned", () => {
    expect(
      checklistScore([
        { code: "a", label: "A", ok: true, weight: 3 },
        { code: "b", label: "B", ok: false, weight: 1 },
      ]),
    ).toBe(75);
  });

  it("is zero for an empty checklist rather than a division by zero", () => {
    expect(checklistScore([])).toBe(0);
  });
});

describe("roundScore", () => {
  it("rounds half up and clamps to the range", () => {
    expect(roundScore(84.5)).toBe(85);
    expect(roundScore(-3)).toBe(0);
    expect(roundScore(140)).toBe(100);
  });
});

describe("band", () => {
  it("names the score the way a rep would say it", () => {
    expect(band(80)).toBe("strong");
    expect(band(79)).toBe("fair");
    expect(band(59)).toBe("weak");
    expect(band(39)).toBe("critical");
  });
});

describe("topOpportunities", () => {
  it("puts the heaviest failures first and ignores what passed", () => {
    const outcomes: PillarOutcome[] = [
      {
        pillar: "gbp",
        status: "ok",
        score: 50,
        findings: [
          { code: "website", label: "No website linked", ok: false, weight: 3 },
          { code: "phone", label: "Phone number", ok: true, weight: 2 },
          { code: "hours", label: "No opening hours", ok: false, weight: 2 },
        ],
      },
    ];
    expect(topOpportunities(outcomes).map((f) => f.code)).toEqual(["website", "hours"]);
  });
});
