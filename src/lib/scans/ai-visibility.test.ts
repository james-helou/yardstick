import { describe, expect, it } from "vitest";
import { LIST_HORIZON, probeValue, rivalTally, scoreAiVisibility, type AiProbeOutcome } from "./ai-visibility";

const CONTEXT = { promptSetVersion: "v1", model: "test-model" };

const probe = (over: Partial<AiProbeOutcome> = {}): AiProbeOutcome => ({
  key: "best",
  intent: "discovery",
  weight: 3,
  mentioned: true,
  position: 1,
  competitors: [],
  ...over,
});

const discovery = (position: number | null, competitors: string[] = []): AiProbeOutcome =>
  probe({ position, mentioned: position !== null, competitors });

describe("probeValue", () => {
  it("pays first place in full and fades to nothing at the horizon", () => {
    expect(probeValue(discovery(1))).toBe(1);
    expect(probeValue(discovery(LIST_HORIZON))).toBeCloseTo(1 / LIST_HORIZON, 5);
  });

  it("scores an absent business at zero, not at the bottom of the list", () => {
    expect(probeValue(probe({ mentioned: false, position: null }))).toBe(0);
  });

  it("gives partial credit for a name in the prose but not the ranking", () => {
    expect(probeValue(probe({ position: null }))).toBeGreaterThan(0);
    expect(probeValue(probe({ position: null }))).toBeLessThan(probeValue(discovery(1)));
  });

  it("treats a place past the horizon the same as a name in the prose", () => {
    expect(probeValue(discovery(LIST_HORIZON + 4))).toBe(probeValue(probe({ position: null })));
  });

  it("scores the brand question on recognition alone, since there is no list to place in", () => {
    expect(probeValue(probe({ intent: "brand", weight: 1, position: null }))).toBe(1);
    expect(probeValue(probe({ intent: "brand", weight: 1, mentioned: false, position: null }))).toBe(0);
  });
});

describe("rivalTally", () => {
  it("counts each rival once per answer, most named first", () => {
    const tally = rivalTally([
      discovery(2, ["Acme Dental", "Acme Dental", "Plateau Care"]),
      discovery(3, ["Acme Dental"]),
    ]);
    expect(tally).toEqual([
      { name: "Acme Dental", answers: 2 },
      { name: "Plateau Care", answers: 1 },
    ]);
  });
});

describe("scoreAiVisibility", () => {
  it("scores a business that leads every answer at the top of the range", () => {
    const outcome = scoreAiVisibility(
      [discovery(1), discovery(1), discovery(1), discovery(1), probe({ key: "brand", intent: "brand", weight: 1 })],
      CONTEXT,
    );
    expect(outcome.status).toBe("ok");
    expect(outcome.score).toBe(100);
    expect(outcome.findings.every((f) => f.ok)).toBe(true);
  });

  it("scores a business no assistant names at zero, and says who is there instead", () => {
    const rivals = ["Acme Dental", "Plateau Care"];
    const outcome = scoreAiVisibility(
      [
        discovery(null, rivals),
        discovery(null, rivals),
        discovery(null, rivals),
        discovery(null, rivals),
        probe({ key: "brand", intent: "brand", weight: 1, mentioned: false, position: null }),
      ],
      CONTEXT,
    );

    expect(outcome.score).toBe(0);
    const rivalFinding = outcome.findings.find((f) => f.code === "ai_rivals");
    expect(rivalFinding?.ok).toBe(false);
    expect(rivalFinding?.label).toContain("Acme Dental");
  });

  it("scores mid when named late in half the answers", () => {
    const outcome = scoreAiVisibility(
      [
        discovery(4),
        discovery(5),
        discovery(null),
        discovery(null),
        probe({ key: "brand", intent: "brand", weight: 1 }),
      ],
      CONTEXT,
    );
    // ((0.4 + 0.2) * 3 + 1) / 13 = 0.215
    expect(outcome.score).toBe(22);
    expect(outcome.findings.find((f) => f.code === "ai_top_three")?.ok).toBe(false);
  });

  it("stamps the prompt set and model, because a score is only comparable within them", () => {
    const outcome = scoreAiVisibility([discovery(1)], CONTEXT);
    expect(outcome.detail).toBe("Prompt set v1, asked of test-model");
  });

  it("fails rather than scoring zero when no answers came back at all", () => {
    const outcome = scoreAiVisibility([], CONTEXT);
    expect(outcome).toMatchObject({ status: "failed", findings: [] });
    expect(outcome.score).toBeUndefined();
  });
});
