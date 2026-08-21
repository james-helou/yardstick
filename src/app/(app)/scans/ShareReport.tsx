"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";
import { revokeReportAction, shareReportAction } from "./actions";

/**
 * The share control. A live link shows the URL itself rather than a "copy" button alone,
 * because a rep on a call reads it out as often as they paste it.
 */
export function ShareReport({
  scanId,
  url,
  views,
}: {
  scanId: string;
  /** Built on the server from the request host, so the markup matches on hydration. */
  url: string | null;
  views: number;
}) {
  const [shareState, share] = useActionState(shareReportAction, EMPTY_FORM_STATE);
  const [revokeState, revoke] = useActionState(revokeReportAction, EMPTY_FORM_STATE);
  const [copied, setCopied] = useState(false);

  if (!url) {
    return (
      <div className="panel panel-pad">
        <h2 className="section-title">Share this report</h2>
        <p className="mt-0.5 text-sm text-ink-muted">
          Creates a link anyone can open, with no login. You can revoke it at any time.
        </p>
        <form action={share} className="mt-3">
          <input type="hidden" name="scanId" value={scanId} />
          <SubmitButton label="Create a share link" pendingLabel="Creating" />
        </form>
        <FormError message={shareState.errors.form} />
      </div>
    );
  }

  return (
    <div className="panel panel-pad">
      <h2 className="section-title">Shared report</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        {views === 0 ? "Not opened yet" : `Opened ${views} time${views === 1 ? "" : "s"}`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="rounded-sm border border-line bg-surface-2 px-2 py-1 break-all">
          {url}
        </code>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
        <form action={revoke}>
          <input type="hidden" name="scanId" value={scanId} />
          <SubmitButton label="Revoke" pendingLabel="Revoking" variant="danger" />
        </form>
      </div>
      <FormError message={revokeState.errors.form} />
    </div>
  );
}
