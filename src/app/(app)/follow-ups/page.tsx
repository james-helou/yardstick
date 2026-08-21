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
        <p className="mt-1 text-sm text-ink-muted">
          {summary.total === 0
            ? "Nothing is waiting on an answer."
            : summary.callNow > 0
              ? `${summary.callNow} being read right now. ${summary.chasing} more worth chasing.`
              : `${summary.total} waiting on an answer, ${summary.chasing} of them worth chasing.`}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
          <p className="font-medium">Every proposal has been answered.</p>
          <p className="mt-1 text-ink-muted">Send one and it shows up here the day it goes out.</p>
          <Link href="/proposals/new" className="btn btn-secondary btn-sm mt-4">
            New proposal
          </Link>
        </div>
      ) : (
        <ol className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.proposalId} className="panel panel-pad">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <StateChip state={item.state} />
                <Link href={`/proposals/${item.proposalId}`} className="font-medium hover:underline">
                  {item.businessName ?? item.title}
                </Link>
                <span className="text-sm text-ink-muted">{item.title}</span>
                <span className="ml-auto text-sm font-medium tabular-nums">
                  {formatMoney(item.contractValue)}
                </span>
              </div>

              <p className="mt-2 text-sm text-ink">{item.because}</p>
              <p className="mt-0.5 text-sm font-medium">{item.next}</p>

              {item.businessId ? (
                <Link
                  href={`/businesses/${item.businessId}`}
                  className="mt-2 inline-block text-xs text-ink-muted hover:underline"
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
      fallback={<div className="skeleton h-64" aria-hidden="true" />}
    >
      <Queue />
    </GuardedSuspense>
  );
}
