"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { BUSINESS_STATUSES } from "@/lib/businesses/schema";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

export type BusinessDefaults = {
  id?: string;
  name?: string;
  status?: string;
  addressLine?: string | null;
  locality?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  primaryCategory?: string | null;
  websiteUrl?: string | null;
  phone?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  prospect: "Prospect",
  client: "Client",
  archived: "Archived",
};

/**
 * Manual entry. Everything except the name is optional on purpose: a rep types what is
 * on the business card now and fills the rest in after a scan.
 */
export function BusinessForm({
  action,
  defaults = {},
  submitLabel,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaults?: BusinessDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const e = state.errors;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-4">
      <FormError message={e.form} />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      <Field name="name" label="Business name" required defaultValue={defaults.name} error={e.name} />

      <Field name="status" label="Status" error={e.status}>
        <select
          id="status"
          name="status"
          defaultValue={defaults.status ?? "prospect"}
          className="rounded border px-3 py-2 text-sm"
        >
          {BUSINESS_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </Field>

      <Field
        name="primaryCategory"
        label="Category"
        defaultValue={defaults.primaryCategory}
        placeholder="Dentist, plumber, law firm"
        error={e.primaryCategory}
      />
      <Field
        name="websiteUrl"
        label="Website"
        defaultValue={defaults.websiteUrl}
        placeholder="acme.com"
        error={e.websiteUrl}
      />
      <Field name="phone" label="Phone" defaultValue={defaults.phone} error={e.phone} />

      <fieldset className="flex flex-col gap-4 rounded border p-4">
        <legend className="px-1 text-sm font-medium">Where it is</legend>
        <Field name="addressLine" label="Street address" defaultValue={defaults.addressLine} error={e.addressLine} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="locality" label="City" defaultValue={defaults.locality} error={e.locality} />
          <Field name="region" label="Province or state" defaultValue={defaults.region} error={e.region} />
          <Field name="postalCode" label="Postal code" defaultValue={defaults.postalCode} error={e.postalCode} />
          <Field
            name="country"
            label="Country"
            defaultValue={defaults.country}
            placeholder="CA"
            hint="Two letter code."
            error={e.country}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="latitude"
            label="Latitude"
            defaultValue={defaults.latitude}
            hint="Needed later for the rank grid."
            error={e.latitude}
          />
          <Field name="longitude" label="Longitude" defaultValue={defaults.longitude} error={e.longitude} />
        </div>
      </fieldset>

      <div>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
