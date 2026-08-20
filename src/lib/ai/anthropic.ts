import { callExternal, ExternalCallError, type CallOptions } from "@/lib/external/call";
import type { AiAnswer, AiProvider } from "./types";

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const PROVIDER = "anthropic";
const API_VERSION = "2023-06-01";
/** Long enough for a list of five with a line of context each, short enough to stay cheap. */
const MAX_TOKENS = 700;

export class AiRequestError extends ExternalCallError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(PROVIDER, message);
    this.name = "AiRequestError";
  }
}

type MessageResponse = {
  content?: { type?: string; text?: string }[];
  model?: string;
};

/** Rate limits and outages are weather. A bad request is not, and retrying wastes money. */
const isRetryable = (error: unknown) =>
  error instanceof AiRequestError ? error.status === 429 || error.status >= 500 : true;

export function anthropicAi(config: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  callOptions?: Partial<CallOptions>;
}): AiProvider {
  const doFetch = config.fetchImpl ?? fetch;

  return {
    name: PROVIDER,
    model: config.model,

    async ask(prompt, options): Promise<AiAnswer> {
      const body = await callExternal(
        async (signal) => {
          const response = await doFetch(ENDPOINT, {
            method: "POST",
            signal,
            headers: {
              "content-type": "application/json",
              "x-api-key": config.apiKey,
              "anthropic-version": API_VERSION,
            },
            body: JSON.stringify({
              model: config.model,
              max_tokens: MAX_TOKENS,
              // Zero, so the same question twice is the same answer twice. A visibility
              // score that moved because the sampler rolled differently is not a finding.
              temperature: 0,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          if (!response.ok) {
            throw new AiRequestError(response.status, `Anthropic answered ${response.status}`);
          }
          return (await response.json()) as MessageResponse;
        },
        {
          name: PROVIDER,
          // A completion is slower than an API lookup, and the default would time out
          // a healthy answer.
          timeoutMs: 30_000,
          isRetryable,
          signal: options?.signal,
          ...config.callOptions,
        },
      );

      const text = (body.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text as string)
        .join("\n")
        .trim();

      return { model: body.model ?? config.model, text };
    },
  };
}
