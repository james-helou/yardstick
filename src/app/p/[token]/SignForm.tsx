"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Field, FormError } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * Two submit buttons, one form. The answer travels as the button's own value, so this
 * works before any JavaScript loads and there is no hidden field to fall out of step
 * with what the person actually pressed.
 */
function Answer({ value, label, primary }: { value: "accepted" | "declined"; label: string; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={value}
      disabled={pending}
      className={
        primary
          ? "btn btn-primary"
          : "rounded border px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-60"
      }
    >
      {pending ? "Sending…" : label}
    </button>
  );
}

/** Accepting is typing your own name, which is what a typed signature is. */
export function SignForm({ action, token }: { action: Action; token: string }) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="panel panel-pad flex flex-col gap-4">
      <h2 className="section-title">Your answer</h2>
      <FormError message={state.errors.form} />

      <input type="hidden" name="token" value={token} />

      <Field
        name="signerName"
        label="Your full name"
        required
        error={state.errors.signerName}
        hint="Typing your name here signs these terms."
        autoComplete="name"
      />
      <Field
        name="signerEmail"
        label="Email"
        type="email"
        required
        error={state.errors.signerEmail}
        hint="Where a copy goes."
        autoComplete="email"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Answer value="accepted" label="Accept and sign" primary />
        <Answer value="declined" label="Decline" />
      </div>
    </form>
  );
}
