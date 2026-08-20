import { describe, expect, it } from "vitest";
import { evaluateCase } from "./eval";
import type { AiProvider } from "./types";

const NAMED = ["1. **Bright Smile Dental** - downtown", "2. Plateau Dental Care"].join("\n");
const ABSENT = ["1. Plateau Dental Care", "2. Acme Dental"].join("\n");

const SUBJECT = { name: "Bright Smile Dental", category: "dentist", place: "Montreal, QC" };

/** Answers from a list, one per call, so a run can be made to drift on purpose. */
const provider = (answers: string[]): AiProvider => {
  let call = 0;
  return {
    name: "fake",
    model: "test-model",
    ask: async () => ({ model: "test-model", text: answers[call++ % answers.length] }),
  };
};

describe("evaluateCase", () => {
  it("passes a provider that answers the same way every time", async () => {
    const result = await evaluateCase(provider([NAMED]), SUBJECT, { runs: 3, concurrency: 1 });

    expect(result.stability.runs).toBe(3);
    expect(result.stability.spread).toBe(0);
    expect(result.passed).toBe(true);
  });

  it("fails a provider whose answer swings between runs", async () => {
    // Five prompts a run: run one is named throughout, run two is absent throughout.
    const swinging = provider([...Array(5).fill(NAMED), ...Array(5).fill(ABSENT)]);
    const result = await evaluateCase(swinging, SUBJECT, { runs: 2, concurrency: 1 });

    expect(result.stability.spread).toBeGreaterThan(8);
    expect(result.stability.disagreements.length).toBeGreaterThan(0);
    expect(result.passed).toBe(false);
  });

  it("checks a stated expectation as well as the drift", async () => {
    const stable = await evaluateCase(provider([ABSENT]), { ...SUBJECT, expect: "named" }, {
      runs: 2,
      concurrency: 1,
    });

    // Perfectly repeatable, and perfectly wrong. Both have to hold for a pass.
    expect(stable.stability.stable).toBe(true);
    expect(stable.expectationMet).toBe(false);
    expect(stable.passed).toBe(false);
  });

  it("passes an absence it was told to expect", async () => {
    const result = await evaluateCase(provider([ABSENT]), { ...SUBJECT, expect: "absent" }, {
      runs: 2,
      concurrency: 1,
    });
    expect(result).toMatchObject({ expectationMet: true, passed: true });
  });

  it("leaves the verdict open when the case states no expectation", async () => {
    const result = await evaluateCase(provider([NAMED]), SUBJECT, { runs: 2, concurrency: 1 });
    expect(result.expectationMet).toBeNull();
  });
});
