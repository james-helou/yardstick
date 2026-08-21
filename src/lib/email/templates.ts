import type { EmailMessage } from "./types";

/**
 * Templates are pure: subject and body in, no network, no database, no clock. That is
 * what lets a test read the words a prospect will actually receive.
 */

export const TEMPLATES = {
  reportReady: "report_ready",
  newLead: "new_lead",
  proposalDecided: "proposal_decided",
} as const;

export type TemplateName = (typeof TEMPLATES)[keyof typeof TEMPLATES];

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** A business name is somebody else's text. It is escaped before it is markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function layout(input: { heading: string; paragraphs: string[]; action?: { label: string; url: string } }): string {
  const body = input.paragraphs.map((p) => `    <p style="margin:0 0 16px">${p}</p>`).join("\n");
  const action = input.action
    ? `    <p style="margin:24px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(input.action.label)}</a></p>`
    : "";

  // Inline styles and a plain table-free column: every client renders this the same way,
  // and nothing here depends on a stylesheet surviving the trip.
  return [
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#111827;max-width:560px;margin:0 auto;padding:24px">`,
    `    <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.heading)}</h1>`,
    body,
    action,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

const firstName = (name: string | null | undefined): string | null => {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
};

export type ReportReadyInput = {
  agencyName: string;
  businessName: string;
  contactName?: string | null;
  reportUrl: string;
  to: string;
  replyTo?: string | null;
};

/** To the person who asked. The link is the whole point, so it is above everything else. */
export function reportReadyEmail(input: ReportReadyInput): EmailMessage & { template: TemplateName } {
  const greeting = firstName(input.contactName) ? `Hi ${firstName(input.contactName)},` : "Hi,";
  const subject = `Your local search report for ${input.businessName}`;

  const text = [
    greeting,
    "",
    `Here is the local search audit you asked for. It covers how ${input.businessName} shows up on Google, what customers see when they look you up, and where the gaps are.`,
    "",
    input.reportUrl,
    "",
    "The report keeps filling in for a minute or two after you open it, so a section that looks empty is usually still being measured.",
    "",
    `Prepared by ${input.agencyName}.`,
  ].join("\n");

  const html = layout({
    heading: `Your local search report for ${input.businessName}`,
    paragraphs: [
      escapeHtml(greeting),
      `Here is the local search audit you asked for. It covers how ${escapeHtml(input.businessName)} shows up on Google, what customers see when they look you up, and where the gaps are.`,
      "The report keeps filling in for a minute or two after you open it, so a section that looks empty is usually still being measured.",
      `Prepared by ${escapeHtml(input.agencyName)}.`,
    ],
    action: { label: "Open the report", url: input.reportUrl },
  });

  return { template: TEMPLATES.reportReady, to: input.to, subject, text, html, replyTo: input.replyTo ?? null };
}

export type NewLeadInput = {
  to: string;
  businessName: string;
  email: string;
  contactName?: string | null;
  phone?: string | null;
  reportUrl: string;
};

/** To the agency. Everything needed to pick up the phone, in the first two lines. */
export function newLeadEmail(input: NewLeadInput): EmailMessage & { template: TemplateName } {
  const subject = `New audit request: ${input.businessName}`;
  const contact = [input.contactName?.trim(), input.email, input.phone?.trim()].filter(Boolean).join(" · ");

  const text = [
    `${input.businessName} just asked for an audit through your widget.`,
    "",
    contact,
    "",
    "Their report, the same one they received:",
    input.reportUrl,
  ].join("\n");

  const html = layout({
    heading: `New audit request: ${input.businessName}`,
    paragraphs: [
      `${escapeHtml(input.businessName)} just asked for an audit through your widget.`,
      escapeHtml(contact),
      "Their report, the same one they received:",
    ],
    action: { label: "Open the report", url: input.reportUrl },
  });

  return { template: TEMPLATES.newLead, to: input.to, subject, text, html, replyTo: input.email };
}
