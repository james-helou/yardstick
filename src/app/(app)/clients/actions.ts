"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveWorkspace } from "@/lib/auth/workspace";
import {
  addWorkItem,
  endEngagement,
  getEngagement,
  openEngagement,
  reopenEngagement,
  setWorkStatus,
} from "@/lib/db/repos/engagements";
import { getProposal, listProposalLines, quoteOf } from "@/lib/db/repos/proposals";
import { isWorkStatus } from "@/lib/delivery/plan";

/**
 * The delivery side of a signature.
 *
 * Every action re-resolves the workspace itself. The layout above rendered the page, not
 * these, and a server action is its own entry point.
 */

const refresh = (businessId: string | null) => {
  revalidatePath("/clients");
  if (businessId) revalidatePath(`/businesses/${businessId}`);
};

/**
 * Generates the checklist for a proposal that was accepted but never got one, usually
 * because the signature landed while something downstream was down. Safe to press twice:
 * an engagement that already exists is returned rather than duplicated.
 */
export async function startDeliveryAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return;

  const proposal = await getProposal(scope, proposalId);
  if (!proposal || proposal.status !== "accepted" || !proposal.businessId) return;

  const lines = await listProposalLines(scope, proposal.id);
  const quote = quoteOf(proposal, lines);
  const totals = proposal.totals ?? { oneTime: quote.oneTimeTotal, monthly: quote.monthlyTotal };

  await openEngagement(scope, {
    proposalId: proposal.id,
    monthly: totals.monthly,
    oneTime: totals.oneTime,
    lines: lines.map((line) => ({
      id: line.id,
      name: line.name,
      billing: line.billing,
      quantity: line.quantity,
    })),
    signedAt: proposal.decidedAt ?? undefined,
  });

  refresh(proposal.businessId);
}

export async function setWorkStatusAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const itemId = String(formData.get("itemId") ?? "");
  const status = formData.get("status");
  if (!itemId || !isWorkStatus(status)) return;

  const item = await setWorkStatus(scope, itemId, status);
  refresh(item?.businessId ?? null);
}

export async function addWorkItemAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const engagementId = String(formData.get("engagementId") ?? "");
  const title = String(formData.get("title") ?? "");
  if (!engagementId || title.trim().length === 0) return;

  const item = await addWorkItem(scope, { engagementId, title });
  refresh(item?.businessId ?? null);
}

export async function endEngagementAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) return;

  const reason = String(formData.get("reason") ?? "").trim();
  const ended = await endEngagement(scope, engagementId, reason || null);
  refresh(ended?.businessId ?? null);
}

export async function reopenEngagementAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) return;

  const reopened = await reopenEngagement(scope, engagementId);
  // A reopen that changed nothing still refreshes, so the page never lies about state.
  refresh(reopened?.businessId ?? (await getEngagement(scope, engagementId))?.businessId ?? null);
}
