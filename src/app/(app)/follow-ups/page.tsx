import Link from "next/link";
import { headers } from "next/headers";
import { StateChip } from "@/components/followup";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { followUpQueue } from "@/lib/followups/queue";
import { formatMoney } from "@/lib/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Follow-ups" };

async function Queue() {
  const { scope } = await resolveWorkspace(await headers());
  const { items, summary } = await followUpQueue(scope);

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <p className="mt-1 text-sm text-neutral-600">
          {summary.total === 0
            ? "Nothing is waiting on an answer."
            : summary.callNow > 0
              ? `${summary.callNow} being read right now. ${summary.chasing} more worth chasing.`
              : `${summary.total} waiting on an answer, ${summary.chasing} of them worth chasing.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border p-8 text-center">
          <p className="text-sm text-neutral-600">
            Every proposal has been answered. Send one and it shows up here the day it goes out.
          </p>
          <Link href="/proposals/new" className="mt-3 inline-block text-sm hover:underline">
            New proposal
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.proposalId} className="rounded-md border p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <StateChip state={item.state} />
                <Link href={`/proposals/${item.proposalId}`} className="font-medium hover:underline">
                  {item.businessName ?? item.title}
                </Link>
                <span className="text-sm text-neutral-600">{item.title}</span>
                <span className="ml-auto text-sm font-medium tabular-nums">
                  {formatMoney(item.contractValue)}
                </span>
              </div>

              <p className="mt-2 text-sm text-neutral-700">{item.because}</p>
              <p className="mt-0.5 text-sm font-medium">{item.next}</p>

              {item.businessId ? (
                <Link
                  href={`/businesses/${item.businessId}`}
                  className="mt-2 inline-block text-xs text-neutral-600 hover:underline"
                >
                  Open the business
                </Link>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export default function FollowUpsPage() {
  return (
    <GuardedSuspense
      label="Follow-ups"
      fallback={<div className="h-64 animate-pulse rounded-md bg-neutral-100" aria-hidden="true" />}
    >
      <Queue />
    </GuardedSuspense>
  );
}
