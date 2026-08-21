"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { clientIp, hashIp } from "@/lib/http/client-ip";
import { originFrom } from "@/lib/http/origin";
import { signProposal } from "@/lib/proposals/sign";
import type { FormState } from "@/lib/forms/state";

/**
 * The client's own entry point. There is no session here: the token in the form is the
 * whole authorization, and everything it allows is scoped to the workspace it names.
 */
export async function answerProposalAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const requestHeaders = await headers();
  const ip = clientIp(requestHeaders);
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "") === "declined" ? "declined" : "accepted";

  const result = await signProposal(
    {
      token,
      decision,
      signerName: String(formData.get("signerName") ?? ""),
      signerEmail: String(formData.get("signerEmail") ?? ""),
      ipHash: hashIp(ip),
      userAgent: requestHeaders.get("user-agent"),
    },
    { origin: originFrom(requestHeaders) },
  );

  if (!result.ok) return { errors: result.errors };

  revalidatePath(`/p/${token}`);
  return { errors: {} };
}
