import { escapeHtml, TEMPLATES, type TemplateName } from "./templates";
import type { EmailMessage } from "./types";

/** The invitation a client receives. Pure, like the rest. */

export type PortalInviteInput = {
  to: string;
  agencyName: string;
  businessName: string | null;
  joinUrl: string;
  replyTo?: string | null;
};

/**
 * Says what they will see and what they will not. A client who expects a bill and finds a
 * scoreboard opens the next one; a client who expects a scoreboard and finds a login they
 * do not understand does not.
 */
export function portalInviteEmail(input: PortalInviteInput): EmailMessage & { template: TemplateName } {
  const what = input.businessName ? `how ${input.businessName} is doing` : "how your business is doing";
  const subject = input.businessName
    ? `See how ${input.businessName} is doing in local search`
    : "See how your business is doing in local search";

  const text = [
    "Hi,",
    "",
    `${input.agencyName} set up a page where you can see ${what} in local search: where you rank, what is improving, and what is still weak.`,
    "",
    input.joinUrl,
    "",
    "It updates on its own as we measure. Nothing else about your account is on it.",
  ].join("\n");

  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#111827;max-width:560px;margin:0 auto;padding:24px">`,
    `  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>`,
    `  <p style="margin:0 0 16px">${escapeHtml(input.agencyName)} set up a page where you can see ${escapeHtml(what)} in local search: where you rank, what is improving, and what is still weak.</p>`,
    `  <p style="margin:0 0 16px">It updates on its own as we measure. Nothing else about your account is on it.</p>`,
    `  <p style="margin:24px 0"><a href="${escapeHtml(input.joinUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">Open my results</a></p>`,
    `</div>`,
  ].join("\n");

  return {
    template: TEMPLATES.portalInvite,
    to: input.to,
    subject,
    text,
    html,
    replyTo: input.replyTo ?? null,
  };
}
