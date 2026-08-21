import Link from "next/link";
import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { ListShell, SortableHeader, UrlSearchInput } from "@/components/list";
import { resolveWorkspace } from "@/lib/auth/workspace";
import {
  BUSINESS_LIST_SPEC,
  countBusinessesByStatus,
  listBusinesses,
  type BusinessSort,
} from "@/lib/db/repos/businesses";
import { parseListQuery, toSearchParams, type SortDirection } from "@/lib/list/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Businesses" };

type SearchParams = Record<string, string | string[] | undefined>;

const STATUS_LABEL = { prospect: "Prospect", client: "Client", archived: "Archived" } as const;

function AddButton() {
  return (
    <Link
      href="/businesses/new"
      className="btn btn-primary"
    >
      Add a business
    </Link>
  );
}

async function BusinessTable({ params }: { params: SearchParams }) {
  const { scope } = await resolveWorkspace(await headers());
  const query = parseListQuery<BusinessSort>(params, BUSINESS_LIST_SPEC);

  const [{ rows, window }, counts] = await Promise.all([
    listBusinesses(scope, query),
    countBusinessesByStatus(scope),
  ]);

  const href = (next: Partial<typeof query>) => {
    const search = toSearchParams({ ...query, ...next }, BUSINESS_LIST_SPEC).toString();
    return search ? `/businesses?${search}` : "/businesses";
  };

  return (
    <ListShell
      title="Businesses"
      noun="businesses"
      action={<AddButton />}
      search={query.search}
      window={window}
      href={(page) => href({ page })}
      filters={<UrlSearchInput label="Search" placeholder="Name, city or website" />}
      tiles={[
        { label: "Prospects", value: String(counts.prospect) },
        { label: "Clients", value: String(counts.client) },
        { label: "Archived", value: String(counts.archived) },
      ]}
    >
      <table className="list-table">
        <thead>
          <tr>
            <SortableHeader<BusinessSort>
              column="name"
              label="Name"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={(sort: BusinessSort, direction: SortDirection) => href({ sort, direction, page: 1 })}
            />
            <th scope="col">
              Where
            </th>
            <SortableHeader<BusinessSort>
              column="status"
              label="Status"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={(sort: BusinessSort, direction: SortDirection) => href({ sort, direction, page: 1 })}
            />
            <SortableHeader<BusinessSort>
              column="createdAt"
              label="Added"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={(sort: BusinessSort, direction: SortDirection) => href({ sort, direction, page: 1 })}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((business) => (
            <tr key={business.id}>
              <td className="px-3 py-2">
                <Link href={`/businesses/${business.id}`} className="font-medium hover:underline">
                  {business.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-ink-muted">
                {[business.locality, business.region, business.country].filter(Boolean).join(", ") ||
                  "Not recorded"}
              </td>
              <td className="px-3 py-2">{STATUS_LABEL[business.status]}</td>
              <td className="px-3 py-2 text-right tabular-nums text-ink-muted">
                {business.createdAt.toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ListShell>
  );
}

function TableSkeleton() {
  return <div className="skeleton h-64" aria-hidden="true" />;
}

export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  return (
    <GuardedSuspense label="Businesses" fallback={<TableSkeleton />}>
      <BusinessTable params={params} />
    </GuardedSuspense>
  );
}
