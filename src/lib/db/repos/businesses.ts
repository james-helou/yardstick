import type { BusinessInput, BusinessStatus } from "@/lib/businesses/schema";
import { BUSINESS_STATUSES, parseBusinessInput } from "@/lib/businesses/schema";
import { orderByFragment, pageWindow, type ListQuery, type PageWindow } from "@/lib/list/query";
import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type BusinessSort = "name" | "status" | "createdAt";

export const BUSINESS_LIST_SPEC = {
  sortable: ["name", "status", "createdAt"] as const,
  defaultSort: "createdAt" as const,
  defaultDirection: "desc" as const,
};

/** Whitelisted column names. A sort key never reaches SQL as user text. */
const ORDER_COLUMNS: Record<BusinessSort, string> = {
  name: "lower(name)",
  status: "status",
  createdAt: "created_at",
};

export type Business = {
  id: string;
  orgId: string;
  name: string;
  status: BusinessStatus;
  addressLine: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  primaryCategory: string | null;
  websiteUrl: string | null;
  phone: string | null;
  placeId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  name: string;
  status: BusinessStatus;
  address_line: string | null;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: string | null;
  longitude: string | null;
  primary_category: string | null;
  website_url: string | null;
  phone: string | null;
  place_id: string | null;
  created_at: Date;
  updated_at: Date;
};

/** Driver types are coerced here and nowhere deeper in: NUMERIC arrives as a string. */
const toBusiness = (r: Row): Business => ({
  id: r.id,
  orgId: r.org_id,
  name: r.name,
  status: r.status,
  addressLine: r.address_line,
  locality: r.locality,
  region: r.region,
  postalCode: r.postal_code,
  country: r.country,
  latitude: r.latitude === null ? null : Number(r.latitude),
  longitude: r.longitude === null ? null : Number(r.longitude),
  primaryCategory: r.primary_category,
  websiteUrl: r.website_url,
  phone: r.phone,
  placeId: r.place_id,
  createdAt: new Date(r.created_at),
  updatedAt: new Date(r.updated_at),
});

const COLUMNS = `id, org_id, name, status, address_line, locality, region, postal_code,
  country, latitude, longitude, primary_category, website_url, phone, place_id,
  created_at, updated_at`;

/**
 * A search box is text, not a pattern. Without this, typing "50%" matches every row and
 * the reader concludes the search is broken.
 */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function createBusiness(
  scope: OrgScope,
  input: BusinessInput,
): Promise<Business> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    insert into businesses (
      org_id, name, status, address_line, locality, region, postal_code, country,
      latitude, longitude, primary_category, website_url, phone, place_id
    ) values (
      ${orgId}, ${input.name}, ${input.status}, ${input.addressLine ?? null},
      ${input.locality ?? null}, ${input.region ?? null}, ${input.postalCode ?? null},
      ${input.country ?? null}, ${input.latitude ?? null}, ${input.longitude ?? null},
      ${input.primaryCategory ?? null}, ${input.websiteUrl ?? null}, ${input.phone ?? null},
      ${input.placeId ?? null}
    )
    returning ${db().unsafe(COLUMNS)}
  `;
  return toBusiness(rows[0]);
}

export async function getBusiness(scope: OrgScope, id: string): Promise<Business | null> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select ${db().unsafe(COLUMNS)} from businesses
     where org_id = ${orgId} and id = ${id}
  `;
  return rows.length ? toBusiness(rows[0]) : null;
}

/**
 * The business already on file for a website, if there is one. Public audit requests go
 * through this first, so a prospect who submits the same site twice joins the row that
 * exists instead of creating a second one the agency has to merge by hand.
 */
export async function findBusinessByWebsite(scope: OrgScope, websiteUrl: string): Promise<Business | null> {
  const orgId = requireOrg(scope);
  const parsed = parseBusinessInput({ name: "x", status: "prospect", websiteUrl });
  const normalised = parsed.ok ? parsed.value.websiteUrl : undefined;
  if (!normalised) return null;

  const rows = await db()<Row[]>`
    select ${db().unsafe(COLUMNS)} from businesses
     where org_id = ${orgId} and lower(website_url) = ${normalised.toLowerCase()}
     order by created_at asc
     limit 1
  `;
  return rows.length ? toBusiness(rows[0]) : null;
}

export async function listBusinesses(
  scope: OrgScope,
  query: ListQuery<BusinessSort>,
): Promise<{ rows: Business[]; window: PageWindow }> {
  const orgId = requireOrg(scope);
  const sql = db();
  const term = query.search ? `%${escapeLike(query.search)}%` : null;

  const filter = term
    ? sql`and (
        name ilike ${term} escape '\\'
        or locality ilike ${term} escape '\\'
        or website_url ilike ${term} escape '\\'
      )`
    : sql``;

  const [{ count }] = await sql<{ count: string }[]>`
    select count(*)::text as count from businesses where org_id = ${orgId} ${filter}
  `;

  const window = pageWindow({ total: Number(count), page: query.page });
  if (window.total === 0) return { rows: [], window };

  const rows = await sql<Row[]>`
    select ${sql.unsafe(COLUMNS)} from businesses
     where org_id = ${orgId} ${filter}
     order by ${sql.unsafe(orderByFragment(query, ORDER_COLUMNS))}, id asc
     limit ${window.limit} offset ${window.offset}
  `;
  return { rows: rows.map(toBusiness), window };
}

export async function updateBusiness(
  scope: OrgScope,
  id: string,
  input: BusinessInput,
): Promise<Business | null> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    update businesses set
      name = ${input.name},
      status = ${input.status},
      address_line = ${input.addressLine ?? null},
      locality = ${input.locality ?? null},
      region = ${input.region ?? null},
      postal_code = ${input.postalCode ?? null},
      country = ${input.country ?? null},
      latitude = ${input.latitude ?? null},
      longitude = ${input.longitude ?? null},
      primary_category = ${input.primaryCategory ?? null},
      website_url = ${input.websiteUrl ?? null},
      phone = ${input.phone ?? null},
      updated_at = now()
     where org_id = ${orgId} and id = ${id}
     returning ${db().unsafe(COLUMNS)}
  `;
  return rows.length ? toBusiness(rows[0]) : null;
}

export async function countBusinessesByStatus(
  scope: OrgScope,
): Promise<Record<BusinessStatus, number>> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ status: BusinessStatus; count: string }[]>`
    select status, count(*)::text as count from businesses
     where org_id = ${orgId}
     group by status
  `;
  // Every status is reported, so a tile reads "0" instead of disappearing.
  const counts = Object.fromEntries(BUSINESS_STATUSES.map((s) => [s, 0])) as Record<
    BusinessStatus,
    number
  >;
  for (const row of rows) counts[row.status] = Number(row.count);
  return counts;
}
