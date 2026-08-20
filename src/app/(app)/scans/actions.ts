"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/auth/workspace";
import type { FormState } from "@/lib/forms/state";
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
