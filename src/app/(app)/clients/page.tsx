import Link from "next/link";
import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { Commissions, PortfolioSummary, type PayoutLine } from "@/components/delivery";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { getCommissionPlan, listOwed } from "@/lib/db/repos/commissions";
import { listEngagements, listOpenWork } from "@/lib/db/repos/engagements";
import { listMembers } from "@/lib/db/repos/orgs";
import { portfolioOf } from "@/lib/delivery/portfolio";
import { WORK_KIND_LABEL } from "@/lib/delivery/plan";
import { formatMoney } from "@/lib/money";
import { setCommissionPlanAction, payCommissionAction } from "./actions";

export const dynamic = "force-dynamic";

const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export default function ClientsPage() {
  return (
    <section className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Clients</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Everyone who signed, what they are worth, and what is still owed to them.
        </p>
      </div>

      <GuardedSuspense
        label="Clients"
        fallback={<div className="h-64 animate-pulse rounded-md bg-neutral-100" aria-hidden="true" />}
      >
        <Portfolio />
      </GuardedSuspense>
    </section>
  );
}

async function Portfolio() {
  const { scope } = await resolveWorkspace(await headers());
  const [engagements, open, plan, owed, members] = await Promise.all([
    listEngagements(scope),
    listOpenWork(scope, 12),
    getCommissionPlan(scope),
    listOwed(scope),
    listMembers(scope),
  ]);
  const now = new Date();
  const portfolio = portfolioOf(engagements, now);

  // Everyone who has earned something, named by the address the workspace already knows.
  const nameOf = new Map(members.map((m) => [m.userId, m.name || m.email]));
  const payouts: PayoutLine[] = owed.map((row) => ({
    userId: row.userId,
    label: nameOf.get(row.userId) ?? row.email ?? "A former member",
    accrued: row.accrued,
    paid: row.paid,
    owed: row.owed,
  }));

  if (engagements.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <p className="text-sm text-neutral-600">
          No signed proposals yet. The moment one is accepted, the client and the work it created
          appear here.
        </p>
        <Commissions
          plan={plan}
          lines={payouts}
          setPlan={setCommissionPlanAction}
          pay={payCommissionAction}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PortfolioSummary portfolio={portfolio} />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          Due next
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-neutral-600">Nothing outstanding. Everything owed is done.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {open.map((item) => {
              const late = item.dueAt !== null && item.dueAt.getTime() < now.getTime();
              return (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <Link
                      href={`/businesses/${item.businessId}`}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {item.title}
                    </Link>
                    <p className="text-xs text-neutral-600">
                      {WORK_KIND_LABEL[item.kind]}
                      {item.dueAt ? ` · due ${day(item.dueAt)}` : ""}
                      {late ? " · overdue" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-neutral-600">
                    {item.status === "doing" ? "In progress" : "To do"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Commissions
        plan={plan}
        lines={payouts}
        setPlan={setCommissionPlanAction}
        pay={payCommissionAction}
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-neutral-500">
          The book
        </h2>
        <ul className="flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {engagements.map((engagement) => (
            <li
              key={engagement.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <Link
                  href={`/businesses/${engagement.businessId}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {engagement.businessName ?? "Unnamed"}
                </Link>
                <p className="text-xs text-neutral-600">
                  {engagement.status === "ended"
                    ? `Ended ${day(engagement.endedAt)}${engagement.endedReason ? `. ${engagement.endedReason}` : ""}`
                    : `Since ${day(engagement.startedAt)}`}
                </p>
              </div>
              <p className="text-sm tabular-nums text-neutral-700">
                {engagement.monthly.amount > 0
                  ? `${formatMoney(engagement.monthly)} / month`
                  : formatMoney(engagement.oneTime)}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
