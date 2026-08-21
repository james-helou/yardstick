"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseBusinessInput } from "@/lib/businesses/schema";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { createBusiness, updateBusiness } from "@/lib/db/repos/businesses";
import {
  pauseSchedule,
  resumeSchedule,
  setSchedule,
  stopSchedule,
} from "@/lib/db/repos/schedules";
import { isCadence } from "@/lib/tracking/cadence";
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

export async function setTrackingAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const businessId = String(formData.get("businessId") ?? "");
  const cadence = formData.get("cadence");
  // A cadence nobody offers is not a schedule; ignore rather than invent one.
  if (!businessId || !isCadence(cadence)) return;

  await setSchedule(scope, { businessId, cadence });
  revalidatePath(`/businesses/${businessId}`);
}

export async function pauseTrackingAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  await pauseSchedule(scope, businessId);
  revalidatePath(`/businesses/${businessId}`);
}

export async function resumeTrackingAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  await resumeSchedule(scope, businessId);
  revalidatePath(`/businesses/${businessId}`);
}

export async function stopTrackingAction(formData: FormData): Promise<void> {
  const { scope } = await resolveWorkspace(await headers());
  const businessId = String(formData.get("businessId") ?? "");
  if (!businessId) return;

  await stopSchedule(scope, businessId);
  revalidatePath(`/businesses/${businessId}`);
}
