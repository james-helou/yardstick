"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

export type ProposalFormProps = {
  action: Action;
  submitLabel: string;
  businesses: { id: string; name: string }[];
  /** Present when editing, absent when creating. */
  proposal?: {
    id: string;
    title: string;
    businessId: string | null;
    currency: string;
    termMonths: number;
    freeMonths: number;
    discountPercent: number;
    taxPercent: number;
    notes: string | null;
  };
};

/** The terms of the deal. The lines are edited separately, because they change far more often. */
export function ProposalForm({ action, submitLabel, businesses, proposal }: ProposalFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="panel panel-pad flex flex-col gap-4">
      <FormError message={state.errors.form} />
      {proposal ? <input type="hidden" name="id" value={proposal.id} /> : null}

      <Field
        name="title"
        label="Title"
        required
        defaultValue={proposal?.title}
        error={state.errors.title}
        placeholder="Local search, twelve months"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="businessId" label="Prospect" error={state.errors.businessId}>
          <select
            id="businessId"
            name="businessId"
            defaultValue={proposal?.businessId ?? ""}
            className="control"
          >
            <option value="">Not linked yet</option>
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        </Field>

        <Field name="currency" label="Currency" error={state.errors.currency}>
          <select
            id="currency"
            name="currency"
            defaultValue={proposal?.currency ?? "CAD"}
            // The currency of a proposal is fixed once it exists: every line is priced in it.
            disabled={Boolean(proposal)}
            className="control"
          >
            <option value="CAD">CAD</option>
            <option value="EUR">EUR</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Field
          name="termMonths"
          label="Term (months)"
          defaultValue={proposal?.termMonths ?? 12}
          error={state.errors.termMonths}
          hint="0 is month to month."
        />
        <Field
          name="freeMonths"
          label="Free months"
          defaultValue={proposal?.freeMonths ?? 0}
          error={state.errors.freeMonths}
        />
        <Field
          name="discountPercent"
          label="Whole-quote discount %"
          defaultValue={proposal?.discountPercent ?? 0}
          error={state.errors.discountPercent}
        />
        <Field
          name="taxPercent"
          label="Tax %"
          defaultValue={proposal?.taxPercent ?? 0}
          error={state.errors.taxPercent}
        />
      </div>

      <Field name="notes" label="Notes" defaultValue={proposal?.notes ?? ""} error={state.errors.notes}>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={proposal?.notes ?? ""}
          className="control"
        />
      </Field>

      <div>
        <SubmitButton label={submitLabel} />
      </div>
    </form>
  );
}
