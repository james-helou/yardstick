"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";
import type { PlaceCandidate } from "@/lib/places";
import type { PlaceSearchState } from "./places-actions";

const EMPTY_SEARCH: PlaceSearchState = { candidates: [], searched: false };

function describe(place: PlaceCandidate): string {
  return [place.addressLine, place.locality, place.region].filter(Boolean).join(", ");
}

export function PlaceSearch({
  search,
  importPlace,
}: {
  search: (state: PlaceSearchState, formData: FormData) => Promise<PlaceSearchState>;
  importPlace: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, action] = useActionState(search, EMPTY_SEARCH);
  const [importState, importAction] = useActionState(importPlace, EMPTY_FORM_STATE);

  return (
    <div className="flex flex-col gap-4 panel panel-pad">
      <div>
        <h2 className="section-title">Find it on Google</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Search the listing instead of typing it. Everything below fills in from the result.
        </p>
      </div>

      <form action={action} className="flex gap-2">
        <input
          type="search"
          name="query"
          placeholder="Dentist, Montreal"
          aria-label="Search Google for a business"
          className="control"
        />
        <SubmitButton label="Search" pendingLabel="Searching" />
      </form>

      <FormError message={state.error} />
      <FormError message={importState.errors.form} />

      {state.searched && state.candidates.length === 0 ? (
        <p className="text-sm text-ink-muted">Nothing matched. Add it by hand below.</p>
      ) : null}

      {state.candidates.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line">
          {state.candidates.map((place) => (
            <li key={place.placeId} className="flex items-center justify-between gap-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{place.name}</p>
                <p className="truncate text-xs text-ink-muted">{describe(place)}</p>
              </div>
              <form action={importAction}>
                <input type="hidden" name="candidate" value={JSON.stringify(place)} />
                <SubmitButton label="Add" pendingLabel="Adding" />
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
