"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { archiveServiceItem, createServiceItem, updateServiceItem } from "@/lib/db/repos/catalog";
import type { FormState } from "@/lib/forms/state";
import { parseAmount, parseServiceItem } from "@/lib/proposals/schema";

const fields = (formData: FormData): Record<string, unknown> => Object.fromEntries(formData.entries());

export async function createServiceItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  // An action is its own entry point. The layout above did not protect this.
  const { scope } = await resolveWorkspace(await headers());

  const parsed = parseServiceItem(fields(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  await createServiceItem(scope, parsed.value);
  revalidatePath("/catalog");
  return { errors: {} };
}

export async function repriceServiceItemAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: { form: "Which item?" } };

  const currency = String(formData.get("currency") ?? "CAD") === "EUR" ? "EUR" : "CAD";
  const price = parseAmount(formData.get("unitPrice"), currency);
  if (!price.ok) return { errors: { unitPrice: price.error } };

  const updated = await updateServiceItem(scope, id, { unitPrice: price.value });
  if (!updated) return { errors: { form: "That item is not in this workspace" } };

  revalidatePath("/catalog");
  return { errors: {} };
}

export async function archiveServiceItemAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const id = String(formData.get("id") ?? "");
  if (id) await archiveServiceItem(scope, id);
  revalidatePath("/catalog");
}
