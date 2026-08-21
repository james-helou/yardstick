"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { nameWorkspace } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";

/** Reached when someone is signed in but has no workspace, which sign-up normally creates. */
export default function WelcomePage() {
  const [state, action] = useActionState(nameWorkspace, EMPTY_FORM_STATE);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold">One more thing</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Name the workspace your prospects and scans will live in.
        </p>
      </div>

      <form action={action} className="flex flex-col gap-4">
        <FormError message={state.errors.form} />
        <Field name="agency" label="Agency name" required autoComplete="organization" error={state.errors.agency} />
        <SubmitButton label="Continue" />
      </form>
    </main>
  );
}
