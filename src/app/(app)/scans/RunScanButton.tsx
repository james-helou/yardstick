"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

export function RunScanButton({
  businessId,
  action,
  label = "Run diagnostics",
}: {
  businessId: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  label?: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <div className="flex flex-col gap-2">
      <form action={formAction}>
        <input type="hidden" name="businessId" value={businessId} />
        <SubmitButton label={label} pendingLabel="Starting" />
      </form>
      <FormError message={state.errors.form} />
    </div>
  );
}
