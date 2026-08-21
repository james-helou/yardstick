import { callExternal, ExternalCallError, type CallOptions } from "@/lib/external/call";
import type { EmailMessage, EmailProvider, SentEmail } from "./types";

const ENDPOINT = "https://api.resend.com/emails";
const PROVIDER = "resend";

export class EmailRequestError extends ExternalCallError {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(PROVIDER, message);
    this.name = "EmailRequestError";
  }
}

/** A rejected address will be rejected again. Only rate limits and outages are worth a retry. */
const isRetryable = (error: unknown) =>
  error instanceof EmailRequestError ? error.status === 429 || error.status >= 500 : true;

type SendResponse = { id?: string };

export function resendEmail(config: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
  callOptions?: Partial<CallOptions>;
}): EmailProvider {
  const doFetch = config.fetchImpl ?? fetch;

  return {
    name: PROVIDER,
    from: config.from,

    async send(message: EmailMessage, options): Promise<SentEmail> {
      const body = await callExternal(
        async (signal) => {
          const response = await doFetch(ENDPOINT, {
            method: "POST",
            signal,
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${config.apiKey}`,
            },
            body: JSON.stringify({
              from: config.from,
              to: [message.to],
              subject: message.subject,
              text: message.text,
              html: message.html,
              // A reply goes to the agency, never to us. Sending on someone's behalf
              // without this makes their prospect's answer disappear.
              ...(message.replyTo ? { reply_to: [message.replyTo] } : {}),
            }),
          });

          if (!response.ok) {
            const detail = await response.text().catch(() => "");
            throw new EmailRequestError(
              response.status,
              `Resend answered ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
            );
          }
          return (await response.json()) as SendResponse;
        },
        { name: PROVIDER, timeoutMs: 10_000, isRetryable, signal: options?.signal, ...config.callOptions },
      );

      return { id: body.id ?? "" };
    },
  };
}
