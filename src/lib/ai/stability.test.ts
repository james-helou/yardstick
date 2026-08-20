import { describe, expect, it } from "vitest";
import { assessStability, SCORE_TOLERANCE } from "./stability";

const run = (score: number, mentions: Record<string, boolean> = { best: true }) => ({ score, mentions });

describe("assessStability", () => {
  it("calls a repeated scan stable when the score barely moves", () => {
    const result = assessStability([run(72), run(72), run(74)]);
    expect(result).toMatchObject({ runs: 3, minScore: 72, maxScore: 74, spread: 2, stable: true });
    expect(result.meanScore).toBeCloseTo(72.7, 1);
    expect(result.disagreements).toEqual([]);
  });

  it("calls it unstable once the spread passes the tolerance", () => {
    const result = assessStability([run(50), run(50 + SCORE_TOLERANCE + 1)]);
    expect(result.stable).toBe(false);
  });

  it("names the prompts that answered differently, which is where the spread came from", () => {
    const result = assessStability([
      run(60, { best: true, trusted: true }),
      run(50, { best: true, trusted: false }),
    ]);
    expect(result.disagreements).toEqual(["trusted"]);
  });

  it("treats an identical repeat as perfectly stable", () => {
    expect(assessStability([run(80), run(80)])).toMatchObject({ spread: 0, stable: true });
  });

  it("refuses to assess nothing, rather than reporting a stable zero", () => {
    expect(() => assessStability([])).toThrow(/at least one run/);
  });
});
