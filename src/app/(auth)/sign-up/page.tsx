"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { signUp } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";

export default function SignUpPage() {
  const [state, action] = useActionState(signUp, EMPTY_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Create your workspace</h1>
      <FormError message={state.errors.form} />

      <Field
        name="agency"
        label="Agency name"
        required
        autoComplete="organization"
        error={state.errors.agency}
        hint="This names your workspace. You can change it later."
      />
      <Field name="email" label="Email" type="email" required autoComplete="email" error={state.errors.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="new-password"
        error={state.errors.password}
        hint="At least 8 characters."
      />

      <SubmitButton label="Create workspace" pendingLabel="Creating…" />

      <p className="text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </form>
  );
}
