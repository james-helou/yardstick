import { deliver, type Outgoing } from "@/lib/email";
import { proposalDecidedEmail } from "@/lib/email/proposal-templates";
import { listOrgNotificationEmails } from "@/lib/db/repos/orgs";
import {
  findProposalLinkByToken,
  isLive,
  recordProposalEvent,
  recordSignature,
  type ProposalLink,
} from "@/lib/db/repos/proposal-sharing";
import {
  decideProposal,
  getProposal,
  listProposalLines,
  quoteOf,
  type Proposal,
} from "@/lib/db/repos/proposals";
import { termsFingerprint } from "./fingerprint";

/**
 * The client's side of a proposal: open it, and answer it.
 *
 * Authorization is the token, never a session. What makes a signature worth anything is
 * the check in the middle: the terms are fingerprinted again, right now, and compared
 * with the fingerprint written when the proposal was sent. If they differ, something
 * moved after it left, and nobody signs anything.
 */

export type OpenResult =
  | { ok: true; link: ProposalLink; proposal: Proposal; lines: Awaited<ReturnType<typeof listProposalLines>> }
  | { ok: false; reason: "gone" };

/** Revoked, expired and never-existed are the same answer, so a probe learns nothing. */
export async function openProposal(token: string): Promise<OpenResult> {
  const link = await findProposalLinkByToken(token);
  if (!link || !isLive(link)) return { ok: false, reason: "gone" };

  const scope = { orgId: link.orgId };
  const proposal = await getProposal(scope, link.proposalId);
  if (!proposal || proposal.status === "draft") return { ok: false, reason: "gone" };

  const lines = await listProposalLines(scope, link.proposalId);
  return { ok: true, link, proposal, lines };
}

export type SignInput = {
  token: string;
  decision: "accepted" | "declined";
  signerName: string;
  signerEmail: string;
  ipHash?: string | null;
  userAgent?: string | null;
};

export type SignResult =
  | { ok: true; decision: "accepted" | "declined"; fingerprint: string }
  | { ok: false; status: number; errors: Record<string, string> };

export type SignDeps = {
  sendEmail?: typeof deliver;
  agencyEmails?: typeof listOrgNotificationEmails;
  /** Where the agency can open it again. Absent means no email goes out. */
  origin?: string | null;
};

const EMAIL_SHAPE = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

export async function signProposal(input: SignInput, deps: SignDeps = {}): Promise<SignResult> {
  const opened = await openProposal(input.token);
  if (!opened.ok) return { ok: false, status: 404, errors: { form: "This proposal is no longer open" } };

  const { link, proposal, lines } = opened;
  const scope = { orgId: link.orgId };

  if (proposal.status !== "sent") {
    return { ok: false, status: 409, errors: { form: "This proposal has already been answered" } };
  }

  const errors: Record<string, string> = {};
  const signerName = input.signerName.trim().replace(/\s+/g, " ");
  const signerEmail = input.signerEmail.trim().toLowerCase();
  if (signerName.length < 2) errors.signerName = "Type your full name to sign";
  if (!EMAIL_SHAPE.test(signerEmail)) errors.signerEmail = "Enter an email we can send the copy to";
  if (Object.keys(errors).length > 0) return { ok: false, status: 422, errors };

  // The whole point. Recomputed now, compared with what was stamped at send.
  const fingerprint = termsFingerprint({ ...proposal, lines });
  if (proposal.termsFingerprint && fingerprint !== proposal.termsFingerprint) {
    return {
      ok: false,
      status: 409,
      errors: { form: "These terms have changed since they were sent. Ask for a fresh copy." },
    };
  }

  const decided = await decideProposal(scope, proposal.id, input.decision);
  if (!decided) {
    return { ok: false, status: 409, errors: { form: "This proposal has already been answered" } };
  }

  if (input.decision === "accepted") {
    const totals = proposal.totals ?? {
      oneTime: quoteOf(proposal, lines).oneTimeTotal,
      monthly: quoteOf(proposal, lines).monthlyTotal,
      contractValue: quoteOf(proposal, lines).contractValue,
    };
    await recordSignature(scope, {
      proposalId: proposal.id,
      signerName,
      signerEmail,
      termsFingerprint: fingerprint,
      totals,
      ipHash: input.ipHash,
      userAgent: input.userAgent,
    });
  }

  await recordProposalEvent(scope, {
    proposalId: proposal.id,
    type: input.decision,
    ipHash: input.ipHash,
    userAgent: input.userAgent,
  });

  await notifyAgency({ scope, proposal, decision: input.decision, signerName, signerEmail }, deps);

  return { ok: true, decision: input.decision, fingerprint };
}

/** Best effort, always. An answer that was recorded but not emailed is still recorded. */
async function notifyAgency(
  input: {
    scope: { orgId: string };
    proposal: Proposal;
    decision: "accepted" | "declined";
    signerName: string;
    signerEmail: string;
  },
  deps: SignDeps,
): Promise<void> {
  if (!deps.origin) return;
  const send = deps.sendEmail ?? deliver;
  const addresses = deps.agencyEmails ?? listOrgNotificationEmails;

  try {
    const inboxes = await addresses(input.scope);
    const url = `${deps.origin.replace(/\/+$/, "")}/proposals/${input.proposal.id}`;

    for (const inbox of inboxes) {
      const message: Outgoing = proposalDecidedEmail({
        to: inbox,
        decision: input.decision,
        title: input.proposal.title,
        businessName: input.proposal.businessName,
        signerName: input.signerName,
        signerEmail: input.signerEmail,
        proposalUrl: url,
      });
      // No lead to attach it to, so this is filed against the workspace alone.
      await send(input.scope, message);
    }
  } catch {
    // The answer is already recorded. Telling somebody about it is the smaller half.
  }
}
