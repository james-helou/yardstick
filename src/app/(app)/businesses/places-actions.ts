"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { parseBusinessInput } from "@/lib/businesses/schema";
import { createBusiness } from "@/lib/db/repos/businesses";
import { ExternalCallError } from "@/lib/external/call";
import type { FormState } from "@/lib/forms/state";
import { parsePlaceCandidate, placesProvider, placeToBusinessInput, type PlaceCandidate } from "@/lib/places";

export type PlaceSearchState = { candidates: PlaceCandidate[]; error?: string; searched: boolean };

/**
 * Searching costs money per call, so it is an action a person triggers, never something
 * that runs while they type.
 */
export async function searchPlacesAction(
  _previous: PlaceSearchState,
  formData: FormData,
): Promise<PlaceSearchState> {
  // An action is its own entry point. The layout above did not protect this.
  await resolveWorkspace(await headers());

  const query = String(formData.get("query") ?? "").trim();
  if (query.length < 3) {
    return { candidates: [], searched: false, error: "Give it a little more to go on" };
  }

  const provider = placesProvider();
  if (!provider) return { candidates: [], searched: false, error: "Places lookup is not configured" };

  try {
    return { candidates: await provider.search({ query, limit: 8 }), searched: true };
  } catch (error) {
    // A provider being down is not a bug in this workspace. Manual entry still works,
    // so say what happened and leave the form alone.
    if (error instanceof ExternalCallError) {
      return { candidates: [], searched: false, error: "Places did not answer. Try again, or add it by hand" };
    }
    throw error;
  }
}

export async function importPlaceAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { scope } = await resolveWorkspace(await headers());

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("candidate") ?? ""));
  } catch {
    return { errors: { form: "That result could not be read. Search again" } };
  }

  const candidate = parsePlaceCandidate(raw);
  if (!candidate) return { errors: { form: "That result could not be read. Search again" } };

  // Imported and hand-typed businesses go through the same validator, so neither can
  // put a value in the table the other could not.
  const parsed = parseBusinessInput(placeToBusinessInput(candidate));
  if (!parsed.ok) return { errors: parsed.errors };

  let id: string;
  try {
    id = (await createBusiness(scope, parsed.value)).id;
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
      return { errors: { form: "That listing is already in this workspace" } };
    }
    throw error;
  }

  redirect(`/businesses/${id}`);
}
