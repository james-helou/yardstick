import { PILLAR_WEIGHT, type Pillar } from "./pillars";

export type PillarStatus = "ok" | "skipped" | "failed";

/** One checked thing, in the words the report will use. */
export type Finding = {
  code: string;
  label: string;
  ok: boolean;
  weight: number;
  detail?: string;
  /**
   * False when the provider gave us nothing to judge this by.
   *
   * Absent means measured, so every existing finding keeps its meaning. This is the same
   * distinction `overallScore` already draws between a pillar that scored badly and one
   * nobody ran, one level further down: a check we could not perform is not a check the
   * business failed, and it must not be scored, ranked or shown as one.
   */
  measured?: boolean;
};

export type PillarOutcome = {
  pillar: Pillar;
  status: PillarStatus;
  /** Present only when the pillar ran. */
  score?: number;
  findings: Finding[];
  /** Why it did not run, when it did not. */
  detail?: string;
};

export type Overall = {
  /** Null when nothing was measured. A scan of nothing does not score zero. */
  score: number | null;
  measured: Pillar[];
  unmeasured: Pillar[];
};

const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, n));

/** Rounds half away from zero, so 84.5 is 85 rather than the banker's 84. */
export function roundScore(value: number): number {
  return clamp(Math.round(value), 0, 100);
}

/**
 * A weighted checklist as a percentage. The shape every analyser reduces to.
 *
 * Anything `measured: false` leaves both sides of the fraction, so a checklist is scored
 * out of what was actually checked. A check nobody could perform must not drag a score
 * down, for the same reason an unmeasured pillar does not drag the overall down.
 */
export function checklistScore(findings: Finding[]): number {
  const judged = findings.filter((f) => f.measured !== false);
  const total = judged.reduce((sum, f) => sum + f.weight, 0);
  if (total === 0) return 0;
  const earned = judged.reduce((sum, f) => sum + (f.ok ? f.weight : 0), 0);
  return roundScore((earned / total) * 100);
}

/**
 * Renormalises over the pillars that actually ran. A pillar we could not measure is
 * reported as unmeasured rather than averaged in as a zero, because telling a prospect
 * they scored nothing on something nobody looked at is a lie that sells badly.
 */
export function overallScore(outcomes: PillarOutcome[]): Overall {
  const measured = outcomes.filter(
    (o): o is PillarOutcome & { score: number } => o.status === "ok" && typeof o.score === "number",
  );

  const unmeasured = outcomes.filter((o) => o.status !== "ok").map((o) => o.pillar);

  if (measured.length === 0) return { score: null, measured: [], unmeasured };

  const weight = measured.reduce((sum, o) => sum + PILLAR_WEIGHT[o.pillar], 0);
  const weighted = measured.reduce((sum, o) => sum + o.score * PILLAR_WEIGHT[o.pillar], 0);

  return {
    score: roundScore(weighted / weight),
    measured: measured.map((o) => o.pillar),
    unmeasured,
  };
}

export type Band = "strong" | "fair" | "weak" | "critical";

/** The words a rep says on the call. Bands, not a letter grade nobody agrees on. */
export function band(score: number): Band {
  if (score >= 80) return "strong";
  if (score >= 60) return "fair";
  if (score >= 40) return "weak";
  return "critical";
}

export const BAND_LABEL: Record<Band, string> = {
  strong: "Strong",
  fair: "Needs work",
  weak: "Falling behind",
  critical: "Critical",
};

/** The findings worth putting in front of a prospect first: heaviest failures. */
export function topOpportunities(outcomes: PillarOutcome[], limit = 5): Finding[] {
  return outcomes
    .flatMap((o) => o.findings)
    .filter((f) => !f.ok && f.measured !== false)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit);
}
