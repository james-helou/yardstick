"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms/state";

type Action = (previous: FormState, formData: FormData) => Promise<FormState>;

/**
 * The link the client answers on. A rep reads it out as often as they paste it, so the
 * URL itself is on the page rather than hidden behind a copy button.
 */
export function ShareProposal({
  proposalId,
  url,
  views,
  share,
  revoke,
}: {
  proposalId: string;
  /** Built on the server from the request host, so the markup matches on hydration. */
  url: string | null;
  views: number;
  share: Action;
  revoke: Action;
}) {
  const [shareState, shareAction] = useActionState(share, EMPTY_FORM_STATE);
  const [revokeState, revokeAction] = useActionState(revoke, EMPTY_FORM_STATE);
  const [copied, setCopied] = useState(false);

  if (!url) {
    return (
      <div className="rounded-md border p-4">
        <h2 className="text-sm font-semibold">Send it to the client</h2>
        <p className="mt-0.5 text-sm text-neutral-600">
          Creates a link they can open and sign, with no login. You can revoke it at any time.
        </p>
        <form action={shareAction} className="mt-3">
          <input type="hidden" name="proposalId" value={proposalId} />
          <SubmitButton label="Create a signing link" pendingLabel="Creating" />
        </form>
        <FormError message={shareState.errors.form} />
      </div>
    );
  }

  return (
    <div className="rounded-md border p-4">
      <h2 className="text-sm font-semibold">Signing link</h2>
      <p className="mt-0.5 text-sm text-neutral-600">
        {views === 0 ? "Not opened yet" : `Opened ${views} time${views === 1 ? "" : "s"}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded border bg-neutral-50 px-2 py-1 text-sm break-all">{url}</code>
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm hover:bg-neutral-50"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <form action={revokeAction}>
          <input type="hidden" name="proposalId" value={proposalId} />
          <SubmitButton label="Revoke" pendingLabel="Revoking" />
        </form>
      </div>
      <FormError message={revokeState.errors.form} />
    </div>
  );
}
