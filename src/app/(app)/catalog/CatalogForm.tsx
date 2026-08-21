"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/** Add one thing the agency sells. Price is typed the way it is quoted, in whole currency. */
export function CatalogForm({ action, currency }: { action: Action; currency: string }) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border p-4">
      <h2 className="text-sm font-semibold">Add to the catalogue</h2>
      <FormError message={state.errors.form} />

      <input type="hidden" name="currency" value={currency} />

      <Field name="name" label="Name" required error={state.errors.name} placeholder="Local SEO retainer" />

      <Field
        name="description"
        label="Description"
        hint="Shown to the client under the line, when there is something worth saying."
        error={state.errors.description}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="billing" label="Billing" required error={state.errors.billing}>
          <select
            id="billing"
            name="billing"
            defaultValue="monthly"
            className="rounded border px-3 py-2 text-sm focus:outline-2 focus:outline-offset-2"
          >
            <option value="monthly">Every month</option>
            <option value="one_time">One time</option>
          </select>
        </Field>

        <Field
          name="unitPrice"
          label={`Price (${currency})`}
          required
          error={state.errors.unitPrice}
          placeholder="1200.00"
          hint="Per unit, before any discount."
        />
      </div>

      <div>
        <SubmitButton label="Add item" pendingLabel="Adding…" />
      </div>
    </form>
  );
}
