"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { getServiceItem } from "@/lib/db/repos/catalog";
import { recordProposalEvent, revokeProposalLink, shareProposal } from "@/lib/db/repos/proposal-sharing";
import {
  addProposalLine,
  createProposal,
  getProposal,
  removeProposalLine,
  sendProposal,
  updateProposal,
} from "@/lib/db/repos/proposals";
import type { FormState } from "@/lib/forms/state";
import { parseLineFields, parseProposalFields } from "@/lib/proposals/schema";

const fields = (formData: FormData): Record<string, unknown> => Object.fromEntries(formData.entries());

export async function createProposalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  // An action is its own entry point. The layout above did not protect this.
  const { scope } = await resolveWorkspace(await headers());

  const parsed = parseProposalFields(fields(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  const proposal = await createProposal(scope, parsed.value);
  redirect(`/proposals/${proposal.id}`);
}

export async function updateProposalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: { form: "Which proposal?" } };

  const parsed = parseProposalFields(fields(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  const updated = await updateProposal(scope, id, parsed.value);
  if (!updated) return { errors: { form: "A proposal stops changing once it is sent" } };

  revalidatePath(`/proposals/${id}`);
  return { errors: {} };
}

export async function addLineAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");

  const proposal = await getProposal(scope, proposalId);
  if (!proposal) return { errors: { form: "That proposal is not in this workspace" } };

  const parsed = parseLineFields(fields(formData), proposal.currency);
  if (!parsed.ok) return { errors: parsed.errors };

  const line = await addProposalLine(scope, proposalId, parsed.value);
  if (!line) return { errors: { form: "A proposal stops changing once it is sent" } };

  revalidatePath(`/proposals/${proposalId}`);
  return { errors: {} };
}

/** Adding from the catalogue copies the price, it does not point at it. */
export async function addCatalogLineAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");
  const itemId = String(formData.get("serviceItemId") ?? "");
  if (!proposalId || !itemId) return;

  const item = await getServiceItem(scope, itemId);
  if (!item) return;

  await addProposalLine(scope, proposalId, {
    serviceItemId: item.id,
    name: item.name,
    billing: item.billing,
    unitPrice: item.unitPrice,
    quantity: item.defaultQuantity,
  });
  revalidatePath(`/proposals/${proposalId}`);
}

export async function removeLineAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");
  const lineId = String(formData.get("lineId") ?? "");
  if (lineId) await removeProposalLine(scope, lineId);
  revalidatePath(`/proposals/${proposalId}`);
}

export async function sendProposalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: { form: "Which proposal?" } };

  const result = await sendProposal(scope, id);
  if (!result.ok) {
    const said = {
      not_found: "That proposal is not in this workspace",
      not_a_draft: "This one has already been sent",
      empty: "Add at least one line before sending",
    };
    return { errors: { form: said[result.reason] } };
  }

  // The history the follow-up queue is derived from starts here.
  await recordProposalEvent(scope, { proposalId: id, type: "sent" });

  revalidatePath(`/proposals/${id}`);
  return { errors: {} };
}

export async function shareProposalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return { errors: { form: "Which proposal?" } };

  const link = await shareProposal(scope, { proposalId });
  if (!link) return { errors: { form: "That proposal is not in this workspace" } };

  revalidatePath(`/proposals/${proposalId}`);
  return { errors: {} };
}

export async function revokeProposalLinkAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const proposalId = String(formData.get("proposalId") ?? "");
  if (!proposalId) return { errors: { form: "Which proposal?" } };

  await revokeProposalLink(scope, proposalId);
  revalidatePath(`/proposals/${proposalId}`);
  return { errors: {} };
}
