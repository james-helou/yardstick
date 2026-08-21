import Link from "next/link";
import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { ListShell, SortableHeader, UrlSearchInput } from "@/components/list";
import { StatusChip } from "@/components/proposal";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listProposals, PROPOSAL_LIST_SPEC, type ProposalSort } from "@/lib/db/repos/proposals";
import { formatMoney } from "@/lib/money";
import { parseListQuery, toSearchParams, type SortDirection } from "@/lib/list/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Proposals" };

type SearchParams = Record<string, string | string[] | undefined>;

async function ProposalTable({ params }: { params: SearchParams }) {
  const { scope } = await resolveWorkspace(await headers());
  const query = parseListQuery<ProposalSort>(params, PROPOSAL_LIST_SPEC);
  const { rows, window } = await listProposals(scope, query);

  const href = (next: Partial<typeof query>) => {
    const search = toSearchParams({ ...query, ...next }, PROPOSAL_LIST_SPEC).toString();
    return search ? `/proposals?${search}` : "/proposals";
  };
  const sortHref = (sort: ProposalSort, direction: SortDirection) => href({ sort, direction, page: 1 });

  return (
    <ListShell
      title="Proposals"
      noun="proposals"
      search={query.search}
      window={window}
      href={(page) => href({ page })}
      action={
        <Link href="/proposals/new" className="btn btn-primary">
          New proposal
        </Link>
      }
      filters={<UrlSearchInput label="Search" placeholder="Title or prospect" />}
    >
      <table className="list-table">
        <thead>
          <tr>
            <SortableHeader<ProposalSort>
              column="title"
              label="Proposal"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
            />
            <th scope="col">
              Status
            </th>
            <SortableHeader<ProposalSort>
              column="contractValue"
              label="Worth"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
              align="right"
            />
            <SortableHeader<ProposalSort>
              column="createdAt"
              label="Started"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((proposal) => (
            <tr key={proposal.id}>
              <td className="px-3 py-2">
                <Link href={`/proposals/${proposal.id}`} className="font-medium hover:underline">
                  {proposal.title}
                </Link>
                {proposal.businessName ? (
                  <span className="block text-xs text-ink-muted">{proposal.businessName}</span>
                ) : null}
              </td>
              <td className="px-3 py-2">
                <StatusChip status={proposal.status} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {proposal.totals ? (
                  formatMoney(proposal.totals.contractValue)
                ) : (
                  <span className="text-ink-faint">Not sent</span>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                {proposal.createdAt.toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListShell>
  );
}

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <GuardedSuspense
      label="Proposals"
      fallback={<div className="skeleton h-64" aria-hidden="true" />}
    >
      <ProposalTable params={params} />
    </GuardedSuspense>
  );
}
