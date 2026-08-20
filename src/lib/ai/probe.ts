import { mapWithConcurrency } from "@/lib/concurrency";
import type { AiProbeInput } from "@/lib/db/repos/ai-probes";
import { detectMention } from "./detect";
import { CURRENT_PROMPT_SET, type PromptIntent, type PromptSet, type PromptVars } from "./prompts";
import type { AiProvider } from "./types";

/** A stored probe, plus the two fields the scorer needs and the database does not keep. */
export type ProbeRecord = AiProbeInput & {
  intent: PromptIntent;
  weight: number;
};

/**
 * Puts a whole prompt set to an assistant and measures each answer. Every question is
 * asked independently, so one refusal or timeout costs one probe rather than the pillar.
 *
 * Politely parallel: a handful of completions at a time, because the point is to look
 * like a curious person rather than a crawler.
 */
export async function runPromptSet(
  provider: AiProvider,
  vars: PromptVars,
  options?: { set?: PromptSet; concurrency?: number; signal?: AbortSignal },
): Promise<ProbeRecord[]> {
  const set = options?.set ?? CURRENT_PROMPT_SET;

  return mapWithConcurrency(set.prompts, options?.concurrency ?? 2, async (template) => {
    const prompt = template.render(vars);
    const answer = await provider.ask(prompt, { signal: options?.signal });
    const mention = detectMention(answer.text, vars.name);

    return {
      promptSetVersion: set.version,
      promptKey: template.key,
      prompt,
      model: answer.model,
      response: answer.text,
      mentioned: mention.mentioned,
      position: mention.position,
      // Capped: a long answer can list a dozen, and the first few are the ones an
      // agency will actually talk about on the call.
      competitors: mention.competitors.slice(0, 8),
      intent: template.intent,
      weight: template.weight,
    };
  });
}
