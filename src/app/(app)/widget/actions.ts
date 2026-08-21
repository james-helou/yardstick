"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { createWidgetKey, deactivateWidgetKey } from "@/lib/db/repos/widgets";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

export async function createWidgetKeyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  const label = String(formData.get("label") ?? "").trim();
  await createWidgetKey(scope, { label: label || undefined });

  revalidatePath("/widget");
  return EMPTY_FORM_STATE;
}

export async function deactivateWidgetKeyAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: { form: "Which key?" } };

  await deactivateWidgetKey(scope, id);
  revalidatePath("/widget");
  return EMPTY_FORM_STATE;
}
