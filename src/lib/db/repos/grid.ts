import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

/** One search point on the grid, and where the business ranked when searched from it. */
export type GridPoint = {
  id: string;
  scanId: string;
  keyword: string;
  latitude: number;
  longitude: number;
  /** Null means it did not appear at all, which is worse than any rank. */
  rank: number | null;
  createdAt: Date;
};

type Row = {
  id: string;
  scan_id: string;
  keyword: string;
  latitude: string | number;
  longitude: string | number;
  rank: number | string | null;
  created_at: Date;
};

const toPoint = (r: Row): GridPoint => ({
  id: r.id,
  scanId: r.scan_id,
  keyword: r.keyword,
  latitude: Number(r.latitude),
  longitude: Number(r.longitude),
  rank: r.rank === null ? null : Number(r.rank),
  createdAt: new Date(r.created_at),
});

export type GridPointInput = {
  keyword: string;
  latitude: number;
  longitude: number;
  rank: number | null;
};

/** Append-only, and written in one statement so a half-drawn grid never renders. */
export async function recordGridPoints(
  scope: OrgScope,
  scanId: string,
  points: readonly GridPointInput[],
): Promise<number> {
  const orgId = requireOrg(scope);
  if (points.length === 0) return 0;

  const sql = db();
  // One statement, columns unnested in parallel. A grid is dozens of rows and a
  // half-written one would render as a map with holes in it.
  const rows = await sql<{ id: string }[]>`
    insert into grid_points (org_id, scan_id, keyword, latitude, longitude, rank)
    select ${orgId}, ${scanId}, point.keyword, point.latitude, point.longitude, point.rank
      from unnest(
             ${sql.array(points.map((p) => p.keyword))}::text[],
             ${sql.array(points.map((p) => p.latitude))}::numeric[],
             ${sql.array(points.map((p) => p.longitude))}::numeric[],
             ${sql.array(points.map((p) => p.rank))}::integer[]
           ) as point(keyword, latitude, longitude, rank)
    returning id
  `;
  return rows.length;
}

export async function listGridPoints(scope: OrgScope, scanId: string): Promise<GridPoint[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from grid_points where scan_id = ${scanId} and org_id = ${orgId}
     order by latitude desc, longitude asc
  `;
  return rows.map(toPoint);
}
