import Link from "next/link";
import { headers } from "next/headers";
import { GuardedSuspense } from "@/components/GuardedSuspense";
import { ListShell, SortableHeader, UrlSearchInput } from "@/components/list";
import { ScoreBadge } from "@/components/scan";
import { resolveWorkspace } from "@/lib/auth/workspace";
import { creditBalance } from "@/lib/db/repos/credits";
import { countScansByStatus, listScans, SCAN_LIST_SPEC, type ScanSort } from "@/lib/db/repos/scans";
import { parseListQuery, toSearchParams, type SortDirection } from "@/lib/list/query";

export const dynamic = "force-dynamic";
export const metadata = { title: "Scans" };

type SearchParams = Record<string, string | string[] | undefined>;

export const SCAN_STATUS_LABEL = {
  queued: "Queued",
  running: "Running",
  complete: "Complete",
  failed: "Nothing measured",
} as const;

async function ScanTable({ params }: { params: SearchParams }) {
  const { scope } = await resolveWorkspace(await headers());
  const query = parseListQuery<ScanSort>(params, SCAN_LIST_SPEC);

  const [{ rows, window }, counts, credits] = await Promise.all([
    listScans(scope, query),
    countScansByStatus(scope),
    creditBalance(scope),
  ]);

  const href = (next: Partial<typeof query>) => {
    const search = toSearchParams({ ...query, ...next }, SCAN_LIST_SPEC).toString();
    return search ? `/scans?${search}` : "/scans";
  };

  const sortHref = (sort: ScanSort, direction: SortDirection) => href({ sort, direction, page: 1 });

  return (
    <ListShell
      title="Scans"
      noun="scans"
      search={query.search}
      window={window}
      href={(page) => href({ page })}
      filters={<UrlSearchInput label="Search" placeholder="Business name" />}
      tiles={[
        { label: "Complete", value: String(counts.complete) },
        { label: "In flight", value: String(counts.queued + counts.running) },
        { label: "Nothing measured", value: String(counts.failed) },
        { label: "Scan credits", value: String(credits) },
      ]}
    >
      <table className="w-full text-sm">
        <thead className="border-b bg-neutral-50">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Business
            </th>
            <SortableHeader<ScanSort>
              column="status"
              label="Status"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
            />
            <SortableHeader<ScanSort>
              column="score"
              label="Score"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
              align="right"
            />
            <SortableHeader<ScanSort>
              column="createdAt"
              label="Run"
              activeSort={query.sort}
              activeDirection={query.direction}
              href={sortHref}
              align="right"
            />
          </tr>
        </thead>
        <tbody>
          {rows.map((scan) => (
            <tr key={scan.id} className="border-b last:border-0 hover:bg-neutral-50">
              <td className="px-3 py-2">
                <Link href={`/scans/${scan.id}`} className="font-medium hover:underline">
                  {scan.businessName}
                </Link>
              </td>
              <td className="px-3 py-2 text-neutral-700">{SCAN_STATUS_LABEL[scan.status]}</td>
              <td className="px-3 py-2 text-right">
                <ScoreBadge score={scan.score} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-600">
                {scan.createdAt.toISOString().slice(0, 10)}
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

export default async function ScansPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <GuardedSuspense label="Scans" fallback={<TableSkeleton />}>
      <ScanTable params={params} />
    </GuardedSuspense>
  );
}
