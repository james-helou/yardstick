import Link from "next/link";
import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { ListShell, SortableHeader, UrlSearchInput } from "@/components/list";
import { ScoreBadge } from "@/components/scan";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { listLeads, LEAD_LIST_SPEC, type LeadSort } from "@/lib/db/repos/leads";
import { parseListQuery, toSearchParams, type SortDirection } from "@/lib/list/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

type SearchParams = Record<string, string | string[] | undefined>;

async function LeadTable({ params }: { params: SearchParams }) {
  const { scope } = await resolveWorkspace(await headers());
  const query = parseListQuery<LeadSort>(params, LEAD_LIST_SPEC);
  const { rows, window } = await listLeads(scope, query);

  const href = (next: Partial<typeof query>) => {
    const search = toSearchParams({ ...query, ...next }, LEAD_LIST_SPEC).toString();
    return search ? `/leads?${search}` : "/leads";
  };
  const sortHref = (sort: LeadSort, direction: SortDirection) => href({ sort, direction, page: 1 });

  return (
    <ListShell
      title="Leads"
      noun="leads"
      search={query.search}
      window={window}
      href={(page) => href({ page })}
      filters={<UrlSearchInput label="Search" placeholder="Email or business" />}
    >
      <table className="w-full text-sm">
        <thead className="border-b bg-neutral-50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Business
            </th>
            <SortableHeader<LeadSort>
              column="email"
              label="Contact"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
            />
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Score
            </th>
            <SortableHeader<LeadSort>
              column="createdAt"
              label="Asked"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((lead) => (
            <tr key={lead.id} className="border-b last:border-0 hover:bg-neutral-50">
              <td className="px-3 py-2">
                {lead.businessId ? (
                  <Link href={`/businesses/${lead.businessId}`} className="font-medium hover:underline">
                    {lead.businessName ?? "Business"}
                  </Link>
                ) : (
                  <span className="text-neutral-600">{lead.businessName ?? "Deleted"}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <a href={`mailto:${lead.email}`} className="hover:underline">
                  {lead.email}
                </a>
                {lead.contactName ? <span className="text-neutral-600"> · {lead.contactName}</span> : null}
              </td>
              <td className="px-3 py-2 text-right">
                {lead.scanId ? (
                  <Link href={`/scans/${lead.scanId}`}>
                    <ScoreBadge score={lead.score} />
                  </Link>
                ) : (
                  <ScoreBadge score={null} />
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                {lead.createdAt.toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListShell>
  );
}

function TableSkeleton() {
  return <div className="h-64 animate-pulse rounded-md bg-neutral-100" aria-hidden="true" />;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <GuardedSuspense label="Leads" fallback={<TableSkeleton />}>
      <LeadTable params={params} />
    </GuardedSuspense>
  );
}
