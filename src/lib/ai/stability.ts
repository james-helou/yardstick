/**
 * The eval question for this pillar is not "is the answer right", it is "is the answer
 * the same tomorrow". A visibility score an agency puts in front of a client has to
 * move because the business moved, not because the model rolled a different sample.
 */

export type EvalRun = {
  score: number;
  /** Whether each prompt named the business, keyed by prompt key. */
  mentions: Record<string, boolean>;
};

/** The most a repeated scan of an unchanged business may move and still be trusted. */
export const SCORE_TOLERANCE = 8;

export type Stability = {
  runs: number;
  meanScore: number;
  minScore: number;
  maxScore: number;
  /** Highest score minus lowest. The number the tolerance is about. */
  spread: number;
  /** Prompt keys whose mention flag was not the same in every run. */
  disagreements: string[];
  stable: boolean;
};

export function assessStability(runs: readonly EvalRun[], tolerance = SCORE_TOLERANCE): Stability {
  if (runs.length === 0) {
    throw new Error("Stability needs at least one run to assess");
  }

  const scores = runs.map((r) => r.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const spread = maxScore - minScore;

  const keys = [...new Set(runs.flatMap((r) => Object.keys(r.mentions)))].sort();
  // A prompt that answered differently between runs is where the spread came from,
  // and naming it is what makes a failing eval actionable rather than just red.
  const disagreements = keys.filter((key) => {
    const values = runs.map((r) => r.mentions[key]);
    return values.some((value) => value !== values[0]);
  });

  return {
    runs: runs.length,
    meanScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    minScore,
    maxScore,
    spread,
    disagreements,
    stable: spread <= tolerance,
  };
}
