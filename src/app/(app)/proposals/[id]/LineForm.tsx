"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/** A line that is not in the catalogue, which is most of the interesting ones. */
export function LineForm({
  action,
  proposalId,
  currency,
}: {
  action: Action;
  proposalId: string;
  currency: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="panel panel-pad flex flex-col gap-4">
      <h2 className="section-title">Add a line</h2>
      <FormError message={state.errors.form} />
      <input type="hidden" name="proposalId" value={proposalId} />

      <Field name="name" id="lineName" label="What it is" required error={state.errors.name} placeholder="Content, four posts" />

      <div className="grid gap-4 sm:grid-cols-4">
        <Field name="billing" id="lineBilling" label="Billing" error={state.errors.billing}>
          <select
            id="lineBilling"
            name="billing"
            defaultValue="monthly"
            className="control"
          >
            <option value="monthly">Every month</option>
            <option value="one_time">One time</option>
          </select>
        </Field>

        <Field name="unitPrice" id="lineUnitPrice" label={`Price (${currency})`} required error={state.errors.unitPrice} placeholder="400.00" />
        <Field name="quantity" id="lineQuantity" label="Quantity" defaultValue={1} error={state.errors.quantity} />
        <Field name="discountPercent" id="lineDiscountPercent" label="Line discount %" defaultValue={0} error={state.errors.discountPercent} />
      </div>

      <div>
        <SubmitButton label="Add line" pendingLabel="Adding…" />
      </div>
    </form>
  );
}
