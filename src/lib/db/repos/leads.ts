import { db } from "../client";
import { orderByFragment, pageWindow, type ListQuery, type PageWindow } from "@/lib/list/query";
import { requireOrg, type OrgScope } from "../scope";

export type Lead = {
  id: string;
  orgId: string;
  widgetKeyId: string | null;
  businessId: string | null;
  scanId: string | null;
  email: string;
  contactName: string | null;
  phone: string | null;
  source: string;
  createdAt: Date;
};

export type LeadSort = "createdAt" | "email";

export const LEAD_LIST_SPEC = {
  sortable: ["createdAt", "email"] as const,
  defaultSort: "createdAt" as const,
  defaultDirection: "desc" as const,
};

/** Whitelisted column names. A sort key never reaches SQL as user text. */
const ORDER_COLUMNS: Record<LeadSort, string> = {
  createdAt: "l.created_at",
  email: "lower(l.email)",
};

type Row = {
  id: string;
  org_id: string;
  widget_key_id: string | null;
  business_id: string | null;
  scan_id: string | null;
  email: string;
  contact_name: string | null;
  phone: string | null;
  source: string;
  created_at: Date;
};

const toLead = (r: Row): Lead => ({
  id: r.id,
  orgId: r.org_id,
  widgetKeyId: r.widget_key_id,
  businessId: r.business_id,
  scanId: r.scan_id,
  email: r.email,
  contactName: r.contact_name,
  phone: r.phone,
  source: r.source,
  createdAt: new Date(r.created_at),
});

export type LeadInput = {
  email: string;
  contactName?: string | null;
  phone?: string | null;
  source?: string;
  widgetKeyId?: string | null;
  businessId?: string | null;
  scanId?: string | null;
  ipHash?: string | null;
};

export async function createLead(scope: OrgScope, input: LeadInput): Promise<Lead> {
  const orgId = requireOrg(scope);
  const [row] = await db()<Row[]>`
    insert into leads (org_id, widget_key_id, business_id, scan_id, email, contact_name, phone, source, ip_hash)
    values (
      ${orgId}, ${input.widgetKeyId ?? null}, ${input.businessId ?? null}, ${input.scanId ?? null},
      ${input.email}, ${input.contactName ?? null}, ${input.phone ?? null},
      ${input.source ?? "widget"}, ${input.ipHash ?? null}
    )
    returning *
  `;
  return toLead(row);
}

export type LeadRow = Lead & { businessName: string | null; score: number | null };

export async function listLeads(
  scope: OrgScope,
  query: ListQuery<LeadSort>,
): Promise<{ rows: LeadRow[]; window: PageWindow }> {
  const orgId = requireOrg(scope);
  const sql = db();
  const term = query.search ? `%${query.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;

  const filter = term
    ? sql`and (l.email ilike ${term} escape '\\' or b.name ilike ${term} escape '\\')`
    : sql``;

  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count
      from leads l
      left join businesses b on b.id = l.business_id and b.org_id = l.org_id
     where l.org_id = ${orgId} ${filter}
  `;

  const window = pageWindow({ total: Number(count), page: query.page });
  if (window.total === 0) return { rows: [], window };

  const rows = await sql<(Row & { business_name: string | null; score: number | string | null })[]>`
    select l.*, b.name as business_name, s.score
      from leads l
      left join businesses b on b.id = l.business_id and b.org_id = l.org_id
      left join scans s on s.id = l.scan_id and s.org_id = l.org_id
     where l.org_id = ${orgId} ${filter}
     order by ${sql.unsafe(orderByFragment(query, ORDER_COLUMNS))}, l.id asc
     limit ${window.limit} offset ${window.offset}
  `;

  return {
    rows: rows.map((r) => ({
      ...toLead(r),
      businessName: r.business_name,
      score: r.score === null ? null : Number(r.score),
    })),
    window,
  };
}

/**
 * How many audits this submitter has asked for lately. The rate limit is counted from
 * the leads themselves rather than a separate counter, so a restart cannot reset it and
 * there is nothing to keep in sync.
 */
/**
 * How many audits this submitter has asked for lately. Scoped to one workspace by
 * default: a shared office address that already used up an agency's allowance is not a
 * reason to refuse a different agency's prospect. Omit the org for the cross-tenant
 * ceiling, which is what actually stops a bot walking the widget keys.
 */
export async function countRecentLeadsByIp(input: {
  ipHash: string;
  withinMs: number;
  orgId?: string;
}): Promise<number> {
  const sql = db();
  const since = `${Math.round(input.withinMs / 1000)} seconds`;
  const [row] = await sql<{ recent: string }[]>`
    select count(*) as recent from leads
     where ip_hash = ${input.ipHash}
       ${input.orgId ? sql`and org_id = ${input.orgId}` : sql``}
       and created_at > now() - ${since}::interval
  `;
  return Number(row?.recent ?? 0);
}
