import { escapeHtml, TEMPLATES, type TemplateName } from "./templates";
import type { EmailMessage } from "./types";

/** Templates for the proposal side of the product. Pure, like the rest. */

export type ProposalDecidedInput = {
  to: string;
  decision: "accepted" | "declined";
  title: string;
  businessName: string | null;
  signerName: string;
  signerEmail: string;
  proposalUrl: string;
};

/** To the agency, the moment a client answers. The answer is the subject line. */
export function proposalDecidedEmail(
  input: ProposalDecidedInput,
): EmailMessage & { template: TemplateName } {
  const who = input.businessName ? `${input.businessName}` : input.signerName;
  const verb = input.decision === "accepted" ? "accepted" : "declined";
  const subject = `${who} ${verb}: ${input.title}`;

  const text = [
    `${input.signerName} (${input.signerEmail}) ${verb} "${input.title}".`,
    "",
    input.decision === "accepted"
      ? "The signature is on file with the terms exactly as they were sent."
      : "Nothing was signed. The proposal is closed.",
    "",
    input.proposalUrl,
  ].join("\n");

  const html = [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#111827;max-width:560px;margin:0 auto;padding:24px">`,
    `  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(subject)}</h1>`,
    `  <p style="margin:0 0 16px">${escapeHtml(input.signerName)} (${escapeHtml(input.signerEmail)}) ${verb} this proposal.</p>`,
    `  <p style="margin:0 0 16px">${
      input.decision === "accepted"
        ? "The signature is on file with the terms exactly as they were sent."
        : "Nothing was signed. The proposal is closed."
    }</p>`,
    `  <p style="margin:24px 0"><a href="${escapeHtml(input.proposalUrl)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">Open the proposal</a></p>`,
    `</div>`,
  ].join("\n");

  return {
    template: TEMPLATES.proposalDecided,
    to: input.to,
    subject,
    text,
    html,
    replyTo: input.signerEmail,
  };
}
