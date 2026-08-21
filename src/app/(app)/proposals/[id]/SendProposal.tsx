"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * The one irreversible control on the page, and it says so. After this the price is a
 * record rather than a draft.
 */
export function SendProposal({ action, id, ready }: { action: Action; id: string; ready: boolean }) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormError message={state.errors.form} />
      <input type="hidden" name="id" value={id} />
      {ready ? (
        <SubmitButton label="Send it" pendingLabel="Sending…" />
      ) : (
        <p className="text-sm text-ink-muted">Add a line before sending.</p>
      )}
      {ready ? (
        <p className="text-xs text-ink-faint">
          Sending freezes these totals. Nothing on this page changes afterwards.
        </p>
      ) : null}
    </form>
  );
}
