import { Field, FormError, SubmitButton } from "@/components/form";
import type { PortalGrant } from "@/lib/db/repos/portal";

type Action = (formData: FormData) => Promise<void>;

/**
 * Who, outside the agency, can see this business's results. One row per invitation, with
 * the link visible rather than hidden behind a copy button: a rep reads it out as often
 * as they paste it.
 */
export function ClientAccess({
  businessId,
  grants,
  linkFor,
  invite,
  revoke,
  error,
}: {
  businessId: string;
  grants: PortalGrant[];
  linkFor: (token: string) => string;
  invite: Action;
  revoke: Action;
  error?: string;
}) {
  return (
    <section className="panel panel-pad">
      <h2 className="section-title">Client access</h2>
      <p className="mt-0.5 text-sm text-ink-muted">
        Shows them their own results and nothing else. No prices, no other clients.
      </p>

      <form action={invite} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="businessId" value={businessId} />
        <div className="min-w-56 flex-1">
          <Field name="email" label="Invite by email" type="email" required autoComplete="off" />
        </div>
        <SubmitButton label="Invite" pendingLabel="Inviting" />
      </form>
      <FormError message={error} />

      {grants.length === 0 ? null : (
        <ul className="panel mt-4 flex flex-col divide-y divide-line">
          {grants.map((grant) => (
            <li key={grant.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{grant.email}</p>
                <p className="text-xs text-ink-muted">
                  {grant.revokedAt
                    ? "Revoked"
                    : grant.acceptedAt
                      ? `Opened ${grant.acceptedAt.toISOString().slice(0, 10)}`
                      : "Invited, not opened yet"}
                </p>
                {grant.revokedAt || grant.acceptedAt ? null : (
                  <code className="mt-1 block truncate rounded border bg-surface-2 px-2 py-1 text-xs">
                    {linkFor(grant.token)}
                  </code>
                )}
              </div>
              {grant.revokedAt ? null : (
                <form action={revoke}>
                  <input type="hidden" name="grantId" value={grant.id} />
                  <input type="hidden" name="businessId" value={businessId} />
                  <button type="submit" className="btn btn-secondary btn-sm">
                    Revoke
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
