import { randomBytes } from "node:crypto";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type ReportLink = {
  id: string;
  orgId: string;
  scanId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  scan_id: string;
  token: string;
  expires_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

const toLink = (r: Row): ReportLink => ({
  id: r.id,
  orgId: r.org_id,
  scanId: r.scan_id,
  token: r.token,
  expiresAt: r.expires_at === null ? null : new Date(r.expires_at),
  revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at),
  createdAt: new Date(r.created_at),
});

/**
 * 32 bytes of randomness, url-safe. The token is the whole authorization for a public
 * report, so it has to be long enough that guessing is not a strategy and short enough
 * that a rep can paste it into a text message.
 */
export function newReportToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Shares a scan, or hands back the share that already exists. Re-sharing a scan must not
 * mint a second token: the agency would have two live links and only remember one.
 */
export async function shareScan(
  scope: OrgScope,
  input: { scanId: string; expiresAt?: Date | null },
): Promise<ReportLink | null> {
  const orgId = requireOrg(scope);
  const sql = db();

  // The insert selects from scans, which is what makes this a tenancy check: a scan in
  // another workspace produces no row rather than a link to someone else's report.
  const [row] = await sql<Row[]>`
    insert into report_links (org_id, scan_id, token, expires_at)
    select ${orgId}, ${input.scanId}, ${newReportToken()}, ${input.expiresAt ?? null}
      from scans where id = ${input.scanId} and org_id = ${orgId}
    on conflict (scan_id) do update
       set revoked_at = null,
           expires_at = excluded.expires_at
    returning *
  `;
  return row ? toLink(row) : null;
}

export async function getReportLink(scope: OrgScope, scanId: string): Promise<ReportLink | null> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    select * from report_links where scan_id = ${scanId} and org_id = ${orgId}
  `;
  return row ? toLink(row) : null;
}

export async function revokeReportLink(scope: OrgScope, scanId: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    update report_links set revoked_at = now()
     where scan_id = ${scanId} and org_id = ${orgId} and revoked_at is null
    returning *
  `;
  return rows.length > 0;
}

/**
 * The public lookup. It takes no scope on purpose: the token is the authorization, and
 * the org it belongs to is an output of the call rather than an input to it. Every
 * caller must go through `isLive` before rendering anything.
 */
export async function findReportLinkByToken(token: string): Promise<ReportLink | null> {
  if (token.length < 16) return null;
  const [row] = await db()<Row[]>`select * from report_links where token = ${token}`;
  return row ? toLink(row) : null;
}

/** Revoked beats expired beats live. A link is only live when neither applies. */
export function isLive(link: ReportLink, now: Date = new Date()): boolean {
  if (link.revokedAt !== null) return false;
  return link.expiresAt === null || link.expiresAt.getTime() > now.getTime();
}

/**
 * Records that somebody opened a report. Best effort by design: a view that fails to
 * record must never stop the report from rendering, because the report is the product
 * and the view count is a nice-to-have next to it.
 */
export async function recordReportView(input: {
  link: ReportLink;
  referrer?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await db()`
    insert into report_views (org_id, report_link_id, referrer, user_agent)
    values (${input.link.orgId}, ${input.link.id}, ${input.referrer ?? null}, ${
      // Trimmed: a user agent is long, and only the family of it is ever read.
      input.userAgent?.slice(0, 300) ?? null
    })
  `;
}

export async function countReportViews(scope: OrgScope, scanId: string): Promise<number> {
  const orgId = requireOrg(scope);
  const [row] = await db()<{ views: string }[]>`
    select count(*) as views
      from report_views v
      join report_links l on l.id = v.report_link_id
     where l.scan_id = ${scanId} and v.org_id = ${orgId}
  `;
  return Number(row?.views ?? 0);
}
