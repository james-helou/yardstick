import { orderByFragment, pageWindow, type ListQuery, type PageWindow } from "@/lib/list/query";
import { PILLARS, type Pillar } from "@/lib/scans/pillars";
import { overallScore, type Finding, type PillarOutcome, type PillarStatus } from "@/lib/scans/score";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export type Scan = {
  id: string;
  orgId: string;
  businessId: string;
  status: ScanStatus;
  score: number | null;
  requestedBy: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  expectedPillars: Pillar[];
  createdAt: Date;
};

/** A scan as the list renders it: never useful without the business it measured. */
export type ScanListRow = Scan & { businessName: string };

export type PillarResult = {
  id: string;
  scanId: string;
  pillar: Pillar;
  status: PillarStatus;
  score: number | null;
  findings: Finding[];
  detail: string | null;
  createdAt: Date;
};

export type ScanSort = "createdAt" | "score" | "status";

export const SCAN_LIST_SPEC = {
  sortable: ["createdAt", "score", "status"] as const,
  defaultSort: "createdAt" as const,
  defaultDirection: "desc" as const,
};

const ORDER_COLUMNS: Record<ScanSort, string> = {
  createdAt: "s.created_at",
  // A scan still running has no score. It belongs at the end either way, not the top.
  score: "s.score nulls last",
  status: "s.status",
};

type ScanRow = {
  id: string;
  org_id: string;
  business_id: string;
  status: ScanStatus;
  score: number | string | null;
  requested_by: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  expected_pillars?: string[] | null;
  business_name?: string;
};

type PillarRow = {
  id: string;
  scan_id: string;
  pillar: Pillar;
  status: PillarStatus;
  score: number | string | null;
  findings: Finding[] | null;
  detail: string | null;
  created_at: Date;
};

const toScan = (r: ScanRow): Scan => ({
  id: r.id,
  orgId: r.org_id,
  businessId: r.business_id,
  status: r.status,
  score: r.score === null ? null : Number(r.score),
  requestedBy: r.requested_by,
  startedAt: r.started_at ? new Date(r.started_at) : null,
  finishedAt: r.finished_at ? new Date(r.finished_at) : null,
  expectedPillars: (r.expected_pillars ?? []) as Pillar[],
  createdAt: new Date(r.created_at),
});

const toPillarResult = (r: PillarRow): PillarResult => ({
  id: r.id,
  scanId: r.scan_id,
  pillar: r.pillar,
  status: r.status,
  score: r.score === null ? null : Number(r.score),
  findings: r.findings ?? [],
  detail: r.detail,
  createdAt: new Date(r.created_at),
});

const SCAN_COLUMNS = `s.id, s.org_id, s.business_id, s.status, s.score, s.requested_by,
  s.started_at, s.finished_at, s.created_at, s.expected_pillars`;

export async function createScan(
  scope: OrgScope,
  input: { businessId: string; requestedBy?: string | null },
): Promise<Scan | null> {
  const orgId = requireOrg(scope);
  // The join against businesses is the tenancy check: a business in another workspace
  // simply produces no row, so a forged id cannot start a scan here.
  const rows = await db()<ScanRow[]>`
    insert into scans (org_id, business_id, requested_by)
    select ${orgId}, b.id, ${input.requestedBy ?? null}
      from businesses b
     where b.id = ${input.businessId} and b.org_id = ${orgId}
    returning id, org_id, business_id, status, score, requested_by, started_at, finished_at,
              created_at, expected_pillars
  `;
  return rows.length ? toScan(rows[0]) : null;
}

export async function getScan(scope: OrgScope, id: string): Promise<ScanListRow | null> {
  const orgId = requireOrg(scope);
  const rows = await db()<ScanRow[]>`
    select ${db().unsafe(SCAN_COLUMNS)}, b.name as business_name
      from scans s join businesses b on b.id = s.business_id
     where s.id = ${id} and s.org_id = ${orgId}
  `;
  return rows.length ? { ...toScan(rows[0]), businessName: rows[0].business_name ?? "" } : null;
}

export async function listScans(
  scope: OrgScope,
  query: ListQuery<ScanSort>,
  options: { businessId?: string } = {},
): Promise<{ rows: ScanListRow[]; window: PageWindow }> {
  const orgId = requireOrg(scope);
  const sql = db();
  const term = query.search ? `%${query.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;

  const filter = term ? sql`and b.name ilike ${term} escape '\\'` : sql``;
  const forBusiness = options.businessId ? sql`and s.business_id = ${options.businessId}` : sql``;

  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count
      from scans s join businesses b on b.id = s.business_id
     where s.org_id = ${orgId} ${forBusiness} ${filter}
  `;

  const window = pageWindow({ total: Number(count), page: query.page });
  if (window.total === 0) return { rows: [], window };

  const rows = await sql<ScanRow[]>`
    select ${sql.unsafe(SCAN_COLUMNS)}, b.name as business_name
      from scans s join businesses b on b.id = s.business_id
     where s.org_id = ${orgId} ${forBusiness} ${filter}
     order by ${sql.unsafe(orderByFragment(query, ORDER_COLUMNS))}, s.id asc
     limit ${window.limit} offset ${window.offset}
  `;

  return {
    rows: rows.map((r) => ({ ...toScan(r), businessName: r.business_name ?? "" })),
    window,
  };
}

export async function countScansByStatus(scope: OrgScope): Promise<Record<ScanStatus, number>> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ status: ScanStatus; count: string }[]>`
    select status, count(*)::text as count from scans where org_id = ${orgId} group by status
  `;
  const counts: Record<ScanStatus, number> = { queued: 0, running: 0, complete: 0, failed: 0 };
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}

/**
 * Records which pillars this scan is waiting on. Written when the work is dispatched, so
 * finalisation asks "have the pillars I actually started reported" rather than "have all
 * the pillars this build knows about", which is what stops a new pillar from stranding a
 * scan that is already running.
 */
export async function setExpectedPillars(
  scope: OrgScope,
  id: string,
  pillars: readonly Pillar[],
): Promise<void> {
  const orgId = requireOrg(scope);
  await db()`
    update scans set expected_pillars = ${db().array([...pillars])}, updated_at = now()
     where id = ${id} and org_id = ${orgId}
  `;
}

/** Marks the clock started. Idempotent, so a retried first pillar does not reset it. */
export async function markScanRunning(scope: OrgScope, id: string): Promise<void> {
  const orgId = requireOrg(scope);
  await db()`
    update scans
       set status = 'running', started_at = coalesce(started_at, now()), updated_at = now()
     where id = ${id} and org_id = ${orgId} and status = 'queued'
  `;
}

export async function recordPillarResult(
  scope: OrgScope,
  input: { scanId: string; outcome: PillarOutcome },
): Promise<PillarResult | null> {
  const orgId = requireOrg(scope);
  const { outcome } = input;
  // Append-only, and the insert only lands if the scan belongs to this workspace.
  const rows = await db()<PillarRow[]>`
    insert into pillar_results (org_id, scan_id, pillar, status, score, findings, detail)
    select ${orgId}, s.id, ${outcome.pillar}, ${outcome.status},
           ${outcome.score ?? null}, ${db().json(outcome.findings ?? [])}, ${outcome.detail ?? null}
      from scans s
     where s.id = ${input.scanId} and s.org_id = ${orgId}
    returning *
  `;
  return rows.length ? toPillarResult(rows[0]) : null;
}

/** The newest row per pillar. History stays, but the report reads the latest word. */
export async function latestPillarResults(scope: OrgScope, scanId: string): Promise<PillarResult[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<PillarRow[]>`
    select distinct on (pillar) *
      from pillar_results
     where scan_id = ${scanId} and org_id = ${orgId}
     order by pillar, created_at desc, id desc
  `;
  return rows.map(toPillarResult);
}

/**
 * Called by every pillar as it finishes. Only the last one through does anything, and
 * the row lock is what makes that true when three workers finish in the same
 * millisecond. Returns the finished scan, or null while pillars are still outstanding.
 */
export async function finalizeScan(scope: OrgScope, scanId: string): Promise<Scan | null> {
  const orgId = requireOrg(scope);

  return db().begin(async (tx) => {
    const [scan] = await tx<ScanRow[]>`
      select ${tx.unsafe(SCAN_COLUMNS)} from scans s
       where s.id = ${scanId} and s.org_id = ${orgId}
       for update
    `;
    if (!scan) return null;
    if (scan.status === "complete" || scan.status === "failed") return toScan(scan);

    const rows = await tx<PillarRow[]>`
      select distinct on (pillar) *
        from pillar_results
       where scan_id = ${scanId} and org_id = ${orgId}
       order by pillar, created_at desc, id desc
    `;
    // An older scan predates expected_pillars; fall back to everything this build knows.
    const expected = scan.expected_pillars?.length ? scan.expected_pillars : [...PILLARS];
    const reported = new Set(rows.map((r) => r.pillar));
    if (expected.some((pillar) => !reported.has(pillar as Pillar))) return null;

    const outcomes: PillarOutcome[] = rows.map((r) => {
      const result = toPillarResult(r);
      return {
        pillar: result.pillar,
        status: result.status,
        ...(result.score === null ? {} : { score: result.score }),
        findings: result.findings,
        ...(result.detail === null ? {} : { detail: result.detail }),
      };
    });

    const overall = overallScore(outcomes);
    // Nothing measured is a failed scan, not a scan that scored zero.
    const status: ScanStatus = overall.score === null ? "failed" : "complete";

    const [updated] = await tx<ScanRow[]>`
      update scans s
         set status = ${status}, score = ${overall.score}, finished_at = now(), updated_at = now()
       where s.id = ${scanId} and s.org_id = ${orgId}
      returning s.id, s.org_id, s.business_id, s.status, s.score, s.requested_by,
                s.started_at, s.finished_at, s.created_at, s.expected_pillars
    `;
    return toScan(updated);
  });
}

/**
 * The newest usable answer for this pillar on this business, from any earlier scan
 * inside the window. This is what makes a re-run free: an expensive pillar hands back
 * the recent answer instead of paying a provider for the same question twice.
 */
export async function cachedPillarResult(
  scope: OrgScope,
  input: { businessId: string; pillar: Pillar; withinMs: number },
): Promise<PillarResult | null> {
  const orgId = requireOrg(scope);
  if (input.withinMs <= 0) return null;

  const rows = await db()<PillarRow[]>`
    select p.*
      from pillar_results p
      join scans s on s.id = p.scan_id
     where p.org_id = ${orgId}
       and s.business_id = ${input.businessId}
       and p.pillar = ${input.pillar}
       and p.status = 'ok'
       and p.created_at > now() - make_interval(secs => ${input.withinMs / 1000})
     order by p.created_at desc
     limit 1
  `;
  return rows.length ? toPillarResult(rows[0]) : null;
}
