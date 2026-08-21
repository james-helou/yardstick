"use client";

import { useActionState } from "react";
import { Field, FormError, SubmitButton } from "@/components/form";
import { EMPTY_FORM_STATE } from "@/lib/forms/state";
import { createWidgetKeyAction, deactivateWidgetKeyAction } from "./actions";

export type WidgetKeyView = {
  id: string;
  publicKey: string;
  label: string;
  active: boolean;
  createdAt: string;
};

const snippet = (scriptUrl: string, publicKey: string) =>
  `<script src="${scriptUrl}" data-yardstick-key="${publicKey}" async></script>`;

export function WidgetKeys({
  keys,
  scriptUrl,
  apiUrl,
}: {
  keys: WidgetKeyView[];
  scriptUrl: string;
  apiUrl: string;
}) {
  const [createState, create] = useActionState(createWidgetKeyAction, EMPTY_FORM_STATE);
  const [deactivateState, deactivate] = useActionState(deactivateWidgetKeyAction, EMPTY_FORM_STATE);

  const live = keys.filter((key) => key.active);

  return (
    <>
      {live.length === 0 ? (
        <p className="rounded-sm border border-line bg-surface-2 px-3 py-2 text-ink">
          No live widget yet. Create one and paste the snippet into your site.
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {keys.map((key) => (
          <li key={key.id} className="panel panel-pad">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="section-title">{key.label}</h2>
              <span className="text-xs text-ink-muted">
                {key.active ? `Live since ${key.createdAt}` : "Switched off"}
              </span>
            </div>

            {key.active ? (
              <>
                <pre className="table-scroll mt-3 rounded-sm border border-line bg-surface-2 p-3 text-xs">
                  {snippet(scriptUrl, key.publicKey)}
                </pre>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => navigator.clipboard.writeText(snippet(scriptUrl, key.publicKey))}
                  >
                    Copy snippet
                  </button>
                  <form action={deactivate}>
                    <input type="hidden" name="id" value={key.id} />
                    <SubmitButton label="Switch off" pendingLabel="Switching off" />
                  </form>
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm text-ink-muted">
                This key no longer collects anything. Leads it already brought in are still yours.
              </p>
            )}
          </li>
        ))}
      </ul>
      <FormError message={deactivateState.errors.form} />

      <form action={create} className="flex flex-col gap-3 panel panel-pad">
        <h2 className="section-title">Add a widget</h2>
        <Field name="label" label="What is it for" placeholder="Homepage" />
        <div>
          <SubmitButton label="Create a widget key" pendingLabel="Creating" />
        </div>
        <FormError message={createState.errors.form} />
      </form>

      <details className="panel panel-pad">
        <summary className="cursor-pointer font-medium">Building your own form instead</summary>
        <p className="mt-2 text-ink">
          Post JSON to <code className="rounded-sm bg-surface-2 px-1">{apiUrl}</code> with your key and the
          visitor&apos;s details. The response carries the link to their report.
        </p>
        <pre className="mt-2 overflow-x-auto rounded border border-line bg-surface-2 p-3 text-xs">
          {`{ "key": "${live[0]?.publicKey ?? "yk_…"}", "businessName": "Acme Dental", "email": "owner@acme.com", "website": "acme.com" }`}
        </pre>
      </details>
    </>
  );
}
