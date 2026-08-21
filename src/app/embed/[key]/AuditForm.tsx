"use client";

import Script from "next/script";
import { useActionState, useEffect, useRef } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";
import { requestAuditAction } from "./actions";

/**
 * The form a stranger fills in on the agency's own website. Six fields, two of them
 * required, because every extra box is a reason not to finish.
 *
 * It posts through a server action, so it works before any JavaScript loads. The height
 * message to the parent page is the only thing here that needs the browser.
 */
export function AuditForm({ publicKey, siteKey }: { publicKey: string; siteKey: string | null }) {
  const [state, formAction] = useActionState(requestAuditAction, EMPTY_FORM_STATE);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const post = () => {
      const height = document.documentElement.scrollHeight;
      // The host page is somebody else's site, so the message says what it is and
      // carries nothing but a number.
      window.parent?.postMessage({ type: "yardstick:height", height }, "*");
    };
    post();

    const observer = new ResizeObserver(post);
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [state]);

  return (
    <div ref={root}>
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="key" value={publicKey} />

        <Field
          name="businessName"
          label="Business name"
          required
          error={state.errors.businessName}
          autoComplete="organization"
        />
        <Field
          name="website"
          label="Website"
          placeholder="acme.com"
          error={state.errors.website}
          autoComplete="url"
        />
        <Field name="locality" label="City" error={state.errors.locality} autoComplete="address-level2" />
        <Field
          name="primaryCategory"
          label="What the business does"
          placeholder="dentist, plumber, law firm"
          hint="Used as the search term we check you against"
          error={state.errors.primaryCategory}
        />
        <Field
          name="email"
          label="Email"
          type="email"
          required
          hint="Where the report goes"
          error={state.errors.email}
          autoComplete="email"
        />
        <Field name="contactName" label="Your name" error={state.errors.contactName} autoComplete="name" />

        {siteKey ? (
          <>
            <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={siteKey} />
          </>
        ) : null}

        <SubmitButton label="Run my free audit" pendingLabel="Checking" />
        <FormError message={state.errors.form} />
      </form>
    </div>
  );
}
