"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { revokeReportLink, shareScan } from "@/lib/db/repos/reports";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";
import { startScan } from "@/lib/scans/runner";

export async function runScanAction(_previous: FormState, formData: FormData): Promise<FormState> {
  // An action is its own entry point. The layout above did not protect this.
  const { scope, user } = await resolveWorkspace(await headers());

  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return { errors: { form: "Which business?" } };

  const scan = await startScan(scope, { businessId, requestedBy: user.id });
  if (!scan) return { errors: { form: "That business is not in this workspace" } };

  redirect(`/scans/${scan.id}`);
}

export async function shareReportAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  const scanId = String(formData.get("scanId") ?? "");
  if (!scanId) return { errors: { form: "Which scan?" } };

  const link = await shareScan(scope, { scanId });
  if (!link) return { errors: { form: "That scan is not in this workspace" } };

  // Revalidate rather than redirect: the rep is already looking at the report and wants
  // the link to appear where they are, not a page they have to navigate back from.
  revalidatePath(`/scans/${scanId}`);
  return EMPTY_FORM_STATE;
}

export async function revokeReportAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  const scanId = String(formData.get("scanId") ?? "");
  if (!scanId) return { errors: { form: "Which scan?" } };

  await revokeReportLink(scope, scanId);
  revalidatePath(`/scans/${scanId}`);
  return EMPTY_FORM_STATE;
}
