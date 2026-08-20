import type { PromptIntent } from "@/lib/ai";
import { roundScore, type Finding, type PillarOutcome } from "./score";

/** One question asked, and what the answer said about this business. */
export type AiProbeOutcome = {
  key: string;
  intent: PromptIntent;
  weight: number;
  mentioned: boolean;
  /** 1-based place in the answer's list. Null while mentioned means named, not ranked. */
  position: number | null;
  competitors: string[];
};

/** Past fifth, an assistant's list is scrolled past the same way a SERP is. */
export const LIST_HORIZON = 5;
/** Named somewhere in the prose but not in the ranking. Better than absent, far from won. */
const PROSE_ONLY_VALUE = 0.4;

/** What one probe is worth, from 1 for first place down to 0 for not named at all. */
export function probeValue(probe: AiProbeOutcome): number {
  if (!probe.mentioned) return 0;
  if (probe.intent === "brand") return 1;
  if (probe.position === null) return PROSE_ONLY_VALUE;
  if (probe.position > LIST_HORIZON) return PROSE_ONLY_VALUE;
  return (LIST_HORIZON + 1 - probe.position) / LIST_HORIZON;
}

/** Who the assistants name instead, most often first. The sales conversation in one line. */
export function rivalTally(probes: readonly AiProbeOutcome[]): { name: string; answers: number }[] {
  const counts = new Map<string, { name: string; answers: number }>();
  for (const probe of probes) {
    for (const rival of new Set(probe.competitors)) {
      const key = rival.toLowerCase();
      const entry = counts.get(key) ?? { name: rival, answers: 0 };
      entry.answers += 1;
      counts.set(key, entry);
    }
  }
  return [...counts.values()].sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name));
}

const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 100));

/**
 * How visible a business is to the assistants people now ask instead of searching. The
 * score is the weighted average of what each answer was worth, so being named fifth in
 * one answer out of four is not the same as leading all of them.
 *
 * Discovery questions carry the weight because absence from them is the finding. The
 * brand question is scored lightly: an assistant knowing a business by name when asked
 * directly is table stakes, not distribution.
 */
export function scoreAiVisibility(
  probes: readonly AiProbeOutcome[],
  context: { promptSetVersion: string; model: string },
): PillarOutcome {
  if (probes.length === 0) {
    return {
      pillar: "ai_visibility",
      status: "failed",
      findings: [],
      detail: "No answers came back to measure",
    };
  }

  const discovery = probes.filter((p) => p.intent === "discovery");
  const named = discovery.filter((p) => p.mentioned).length;
  const topThree = discovery.filter((p) => p.position !== null && p.position <= 3).length;
  const brand = probes.filter((p) => p.intent === "brand");
  const brandKnown = brand.length > 0 && brand.every((p) => p.mentioned);

  const rivals = rivalTally(probes);
  const ahead = rivals.filter((r) => r.answers > named);

  const totalWeight = probes.reduce((sum, p) => sum + p.weight, 0);
  const earned = probes.reduce((sum, p) => sum + probeValue(p) * p.weight, 0);

  const findings: Finding[] = [
    {
      code: "ai_named",
      label:
        discovery.length === 0
          ? "No discovery questions were asked"
          : `Named in ${named} of ${discovery.length} AI recommendations (${percent(named, discovery.length)}%)`,
      ok: discovery.length > 0 && named >= discovery.length / 2,
      weight: 3,
      detail:
        named === 0
          ? "Assistants answering this question today do not mention this business at all"
          : undefined,
    },
    {
      code: "ai_top_three",
      label: `In the first three names of ${topThree} of ${discovery.length} answers`,
      ok: discovery.length > 0 && topThree >= discovery.length / 2,
      weight: 3,
      detail:
        topThree === 0 && named > 0
          ? "Mentioned, but never near the front, and the front is what gets read"
          : undefined,
    },
    {
      code: "ai_brand_known",
      label: brandKnown ? "Recognised when asked about by name" : "Not recognised when asked about by name",
      ok: brandKnown,
      weight: 1,
      detail: brandKnown ? undefined : "Assistants have nothing to say about this business yet",
    },
    {
      code: "ai_rivals",
      label:
        ahead.length === 0
          ? "No competitor is named more often"
          : `Named more often than this business: ${ahead
              .slice(0, 3)
              .map((r) => r.name)
              .join(", ")}`,
      ok: ahead.length === 0,
      weight: 2,
      detail: ahead.length === 0 ? undefined : "These are the businesses winning the answer today",
    },
  ];

  return {
    pillar: "ai_visibility",
    status: "ok",
    score: roundScore((totalWeight === 0 ? 0 : earned / totalWeight) * 100),
    findings,
    detail: `Prompt set ${context.promptSetVersion}, asked of ${context.model}`,
  };
}
