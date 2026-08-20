import { GuardedSuspense } from "@/components/GuardedSuspense";
import { db } from "@/lib/db/client";
import { APP_NAME } from "@/lib/version";

/** Reads the database on every request, so it can never be prerendered. */
export const dynamic = "force-dynamic";

export const metadata = { title: `${APP_NAME} health` };

async function DatabaseStatus() {
  const rows = await db()<{ n: number; latest: string | null }[]>`
    select count(*)::int as n, max(name) as latest from schema_migrations
  `;
  const { n, latest } = rows[0];

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      <dt className="text-neutral-500">Database</dt>
      <dd className="font-medium">reachable</dd>
      <dt className="text-neutral-500">Migrations applied</dt>
      <dd className="font-medium tabular-nums">{n}</dd>
      <dt className="text-neutral-500">Latest</dt>
      <dd className="font-mono text-xs">{latest ?? "none"}</dd>
    </dl>
  );
}

function StatusSkeleton() {
  return <div className="h-16 w-64 animate-pulse rounded bg-neutral-200" aria-hidden="true" />;
}

export default function HealthPage() {
  return (
    <main className="mx-auto flex max-w-lg flex-col gap-4 p-8">
      <h1 className="text-lg font-semibold">{APP_NAME} health</h1>
      <GuardedSuspense label="Database status" fallback={<StatusSkeleton />} timeoutMs={8_000}>
        <DatabaseStatus />
      </GuardedSuspense>
    </main>
  );
}
