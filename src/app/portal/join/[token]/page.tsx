import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/server";
import { findGrantByToken } from "@/lib/db/repos/portal";
import { acceptInvitationAction, joinPortalAction } from "../../actions";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your results" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const grant = await findGrantByToken(token);
  // Revoked and never-existed are the same answer, so a probe learns nothing.
  if (!grant || grant.revokedAt !== null) notFound();

  const requestHeaders = await headers();
  const session = await auth().api.getSession({ headers: requestHeaders });

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-16">
      <div>
        <h1 className="text-xl font-semibold">
          {grant.businessName ? `Results for ${grant.businessName}` : "Your results"}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          Sent to {grant.email}. This shows how this business is doing in local search, and nothing
          else.
        </p>
      </div>

      {session?.user ? (
        <form action={acceptInvitationAction} className="flex flex-col gap-3 panel panel-pad">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm">
            Signed in as {session.user.email}. Open it to see where this business stands.
          </p>
          <button
            type="submit"
            className="btn btn-primary"
          >
            Open my results
          </button>
        </form>
      ) : (
        <JoinForm action={joinPortalAction} token={token} email={grant.email} />
      )}
    </main>
  );
}
