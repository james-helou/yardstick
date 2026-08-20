"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { signIn } from "@/lib/auth/actions";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";

export default function SignInPage() {
  const [state, action] = useActionState(signIn, EMPTY_FORM_STATE);

  return (
    <form action={action} className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <FormError message={state.errors.form} />

      <Field name="email" label="Email" type="email" required autoComplete="email" error={state.errors.email} />
      <Field
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        error={state.errors.password}
      />

      <SubmitButton label="Sign in" pendingLabel="Signing in…" />

      <p className="text-sm text-neutral-600">
        No account yet?{" "}
        <Link href="/sign-up" className="underline underline-offset-4">
          Create one
        </Link>
      </p>
    </form>
  );
}
