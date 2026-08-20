import { scoreAiVisibility, type AiProbeOutcome } from "@/lib/scans/ai-visibility";
import { runPromptSet } from "./probe";
import { CURRENT_PROMPT_SET, type PromptSet, type PromptVars } from "./prompts";
import { assessStability, SCORE_TOLERANCE, type EvalRun, type Stability } from "./stability";
import type { AiProvider } from "./types";

/** One business the harness asks about. Public businesses only, and never written to. */
export type EvalCase = PromptVars & {
  /** What we believe the answer should look like. "either" means we are only watching drift. */
  expect?: "named" | "absent" | "either";
};

export type CaseResult = {
  case: EvalCase;
  stability: Stability;
  /** Null when the case carries no expectation to check. */
  expectationMet: boolean | null;
  /** True when the score holds still and the expectation, if any, was met. */
  passed: boolean;
};

const mentionMap = (probes: { promptKey: string; mentioned: boolean }[]): Record<string, boolean> =>
  Object.fromEntries(probes.map((p) => [p.promptKey, p.mentioned]));

/**
 * Asks the same questions about the same business several times over and reports whether
 * the answer held still.
 *
 * This is the eval that matters for this pillar. A score an agency puts in front of a
 * client has to move because the business moved. If a repeat scan of an unchanged
 * business swings, the number is not evidence, and no amount of good prompt wording
 * fixes that.
 */
export async function evaluateCase(
  provider: AiProvider,
  subject: EvalCase,
  options?: { runs?: number; tolerance?: number; set?: PromptSet; concurrency?: number },
): Promise<CaseResult> {
  const set = options?.set ?? CURRENT_PROMPT_SET;
  const tolerance = options?.tolerance ?? SCORE_TOLERANCE;
  const runs: EvalRun[] = [];
  let lastProbes: AiProbeOutcome[] = [];

  for (let i = 0; i < (options?.runs ?? 3); i++) {
    const probes = await runPromptSet(provider, subject, { set, concurrency: options?.concurrency ?? 2 });
    const outcomes: AiProbeOutcome[] = probes.map((probe) => ({
      key: probe.promptKey,
      intent: probe.intent,
      weight: probe.weight,
      mentioned: probe.mentioned,
      position: probe.position,
      competitors: probe.competitors,
    }));
    lastProbes = outcomes;

    const outcome = scoreAiVisibility(outcomes, {
      promptSetVersion: set.version,
      model: probes[0]?.model ?? provider.model,
    });
    runs.push({ score: outcome.score ?? 0, mentions: mentionMap(probes) });
  }

  const stability = assessStability(runs, tolerance);

  const namedAnywhere = lastProbes.some((p) => p.intent === "discovery" && p.mentioned);
  const expectationMet =
    subject.expect === "named"
      ? namedAnywhere
      : subject.expect === "absent"
        ? !namedAnywhere
        : null;

  return {
    case: subject,
    stability,
    expectationMet,
    passed: stability.stable && expectationMet !== false,
  };
}
