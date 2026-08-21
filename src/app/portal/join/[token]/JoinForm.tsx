"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field, FormError } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * Two buttons, one form: set a password, or use the one you already have. The choice
 * travels as the button's own value, so this works before any JavaScript loads.
 *
 * The address is fixed to the one the invitation was sent to and posted from the grant
 * rather than the form, so a forwarded link cannot be claimed by another inbox.
 */
function Choice({ value, label, primary }: { value: "new" | "existing"; label: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="mode"
      value={value}
      disabled={pending}
      className={
        primary
          ? "btn btn-primary"
          : "rounded border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-60"
      }
    >
      {pending ? "Opening…" : label}
    </button>
  );
}

export function JoinForm({ action, token, email }: { action: Action; token: string; email: string }) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="panel panel-pad flex flex-col gap-4">
      <FormError message={state.errors.form} />
      <input type="hidden" name="token" value={token} />

      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Email</span>
        <span className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-ink">{email}</span>
      </div>

      <Field
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        error={state.errors.password}
        hint="At least 8 characters. Set one now, or use the one you already have."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Choice value="new" label="Set a password and open" primary />
        <Choice value="existing" label="I already have one" />
      </div>
    </form>
  );
}
