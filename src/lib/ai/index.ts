import { env } from "@/lib/env";
import { anthropicAi } from "./anthropic";
import type { AiProvider } from "./types";

export type { AiAnswer, AiProvider } from "./types";
export { detectMention, listedNames, namesBusiness, normaliseName, type Mention } from "./detect";
export {
  CURRENT_PROMPT_SET,
  placeLabel,
  promptSet,
  PROMPT_SETS,
  type PromptIntent,
  type PromptSet,
  type PromptTemplate,
  type PromptVars,
} from "./prompts";

/**
 * The flag. Every probe is a paid completion, so the pillar stays dormant until a key
 * exists. Null means the scan reports AI visibility as unmeasured, which is honest,
 * rather than reporting a business as invisible to assistants nobody asked.
 */
export function aiProvider(): AiProvider | null {
  const { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } = env();
  if (!ANTHROPIC_API_KEY) return null;
  return anthropicAi({ apiKey: ANTHROPIC_API_KEY, model: ANTHROPIC_MODEL });
}
