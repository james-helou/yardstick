"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { parseBusinessInput } from "@/lib/businesses/schema";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { createBusiness, updateBusiness } from "@/lib/db/repos/businesses";
import type { FormState } from "@/lib/forms/state";

const DUPLICATE_LISTING = "23505";

const isDuplicate = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error &&
  (error as { code?: string }).code === DUPLICATE_LISTING;

function fields(formData: FormData): Record<string, unknown> {
  return Object.fromEntries(formData.entries());
}

export async function createBusinessAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  // An action is its own entry point. The layout above did not protect this.
  const { scope } = await resolveWorkspace(await headers());

  const parsed = parseBusinessInput(fields(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  let id: string;
  try {
    const business = await createBusiness(scope, parsed.value);
    id = business.id;
  } catch (error) {
    if (isDuplicate(error)) {
      return { errors: { form: "That listing is already in this workspace" } };
    }
    throw error;
  }

  redirect(`/businesses/${id}`);
}

export async function updateBusinessAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());
  const id = String(formData.get("id") ?? "");
  if (!id) return { errors: { form: "Which business?" } };

  const parsed = parseBusinessInput(fields(formData));
  if (!parsed.ok) return { errors: parsed.errors };

  const updated = await updateBusiness(scope, id, parsed.value);
  if (!updated) return { errors: { form: "That business is not in this workspace" } };

  redirect(`/businesses/${id}`);
}
