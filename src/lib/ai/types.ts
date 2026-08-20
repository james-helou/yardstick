/** What an assistant said, and which model said it. */
export type AiAnswer = {
  model: string;
  text: string;
};

/**
 * The seam. Everything above this line is pure: prompts are strings, detection is
 * string matching, scoring is arithmetic. Only this interface touches the network, so
 * the whole pillar is testable without a key and a missing key degrades one pillar
 * rather than failing a scan.
 */
export interface AiProvider {
  readonly name: string;
  /** The model every answer comes from. Stamped on each stored probe. */
  readonly model: string;
  ask(prompt: string, options?: { signal?: AbortSignal }): Promise<AiAnswer>;
}
