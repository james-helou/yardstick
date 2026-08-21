import Link from "next/link";
import { headers } from "next/headers";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listBusinessOptions } from "@/lib/db/repos/businesses";
import { createProposalAction } from "../actions";
import { ProposalForm } from "../ProposalForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "New proposal" };

export default async function NewProposalPage() {
  const { scope } = await resolveWorkspace(await headers());
  // The prospect list is a convenience, not a requirement: a quote can exist before the
  // business is on file.
  const businesses = await listBusinessOptions(scope);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/proposals" className="text-sm text-neutral-600 hover:underline">
          Back to proposals
        </Link>
        <h1 className="mt-1 text-xl font-semibold">New proposal</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Set the terms first, then add what you are selling. Nothing is fixed until you send it.
        </p>
      </div>

      <ProposalForm
        action={createProposalAction}
        submitLabel="Start the proposal"
        businesses={businesses}
      />
    </section>
  );
}
