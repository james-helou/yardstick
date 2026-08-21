import { recordDelivery, type DeliveryStatus } from "@/lib/db/repos/email";
import type { OrgScope } from "@/lib/db/scope";
import { env } from "@/lib/env";
import { resendEmail } from "./resend";
import type { EmailMessage, EmailProvider } from "./types";
import type { TemplateName } from "./templates";

export type Outgoing = EmailMessage & { template: TemplateName };

export type DeliveryResult = {
  status: DeliveryStatus;
  providerId: string | null;
  /** Why nothing was sent, in words a person can act on. Null when it went out. */
  reason: string | null;
};

export type SendDeps = {
  provider?: EmailProvider | null;
  /** Injected so a test can watch the row without a database. */
  record?: typeof recordDelivery;
};

/** Both halves or nothing. A key without a verified sender rejects every message. */
export function emailProvider(): EmailProvider | null {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY || !EMAIL_FROM) return null;
  return resendEmail({ apiKey: RESEND_API_KEY, from: EMAIL_FROM });
}

export function emailConfigured(): boolean {
  return emailProvider() !== null;
}

/**
 * Send one message and write down what happened, whichever way it went.
 *
 * Never throws. Email is a side effect of a lead arriving, and a lead that was captured
 * but not emailed is a smaller problem than a lead that was rejected because the mail
 * provider was down.
 */
export async function deliver(
  scope: OrgScope,
  message: Outgoing,
  deps: SendDeps = {},
): Promise<DeliveryResult> {
  const provider = deps.provider === undefined ? emailProvider() : deps.provider;
  const write = deps.record ?? recordDelivery;

  const finish = async (result: DeliveryResult): Promise<DeliveryResult> => {
    try {
      await write(scope, {
        leadId: null,
        template: message.template,
        toAddress: message.to,
        subject: message.subject,
        status: result.status,
        providerId: result.providerId,
        error: result.reason,
      });
    } catch {
      // The log of the send must not be able to fail the send.
    }
    return result;
  };

  if (!provider) {
    return finish({
      status: "skipped",
      providerId: null,
      reason: "Email is not configured, so nothing was sent",
    });
  }

  try {
    const sent = await provider.send(message);
    return finish({ status: "sent", providerId: sent.id || null, reason: null });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "The mail provider refused the message";
    return finish({ status: "failed", providerId: null, reason });
  }
}

/** The same, but attached to the lead it belongs to, which is how the agency reads it back. */
export async function deliverForLead(
  scope: OrgScope,
  leadId: string,
  message: Outgoing,
  deps: SendDeps = {},
): Promise<DeliveryResult> {
  const write = deps.record ?? recordDelivery;
  return deliver(scope, message, {
    ...deps,
    record: (s, input) => write(s, { ...input, leadId }),
  });
}
