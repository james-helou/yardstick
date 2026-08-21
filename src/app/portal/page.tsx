import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UnauthorizedError } from "@/lib/auth/guards";
import { resolvePortal } from "@/lib/portal/access";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your results" };

export default async function PortalHome() {
  let portal;
  try {
    portal = await resolvePortal(await headers());
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/sign-in");
    throw error;
  }

  // The common case by a distance: a client was given one business, so do not make them
  // click through a list of one.
  if (portal.grants.length === 1) redirect(`/portal/${portal.grants[0].businessId}`);

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Your results</h1>

      {portal.grants.length === 0 ? (
        <p className="panel p-6 text-ink-muted">
          Nothing has been shared with you yet. The invitation you were sent opens this page.
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {portal.grants.map((grant) => (
            <li key={grant.id} className="px-4 py-3">
              <Link href={`/portal/${grant.businessId}`} className="font-medium hover:underline">
                {grant.businessName ?? "Your business"}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
