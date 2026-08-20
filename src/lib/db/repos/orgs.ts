import { db } from "../client";
import { requireOrg, type OrgScope } from "../scope";

export type Role = "owner" | "admin" | "member";

export type Org = { id: string; name: string; slug: string; createdAt: Date };

export type Membership = {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  createdAt: Date;
};

type OrgRow = { id: string; name: string; slug: string; created_at: Date };
type MembershipRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: Date;
};

/** Driver types are coerced here and nowhere deeper in. */
const toOrg = (r: OrgRow): Org => ({
  id: r.id,
  name: r.name,
  slug: r.slug,
  createdAt: new Date(r.created_at),
});

const toMembership = (r: MembershipRow): Membership => ({
  id: r.id,
  orgId: r.org_id,
  userId: r.user_id,
  role: r.role,
  createdAt: new Date(r.created_at),
});

export async function createOrg(input: { name: string; slug: string }): Promise<Org> {
  const rows = await db()<OrgRow[]>`
    insert into orgs (name, slug)
    values (${input.name}, ${input.slug})
    returning id, name, slug, created_at
  `;
  return toOrg(rows[0]);
}

export async function findOrgBySlug(slug: string): Promise<Org | null> {
  const rows = await db()<OrgRow[]>`
    select id, name, slug, created_at from orgs where slug = ${slug}
  `;
  return rows.length ? toOrg(rows[0]) : null;
}

export async function addMembership(
  scope: OrgScope,
  input: { userId: string; role: Role },
): Promise<Membership> {
  const orgId = requireOrg(scope);
  const rows = await db()<MembershipRow[]>`
    insert into memberships (org_id, user_id, role)
    values (${orgId}, ${input.userId}, ${input.role})
    returning id, org_id, user_id, role, created_at
  `;
  return toMembership(rows[0]);
}

export async function findMembership(
  scope: OrgScope,
  userId: string,
): Promise<Membership | null> {
  const orgId = requireOrg(scope);
  const rows = await db()<MembershipRow[]>`
    select id, org_id, user_id, role, created_at
      from memberships
     where org_id = ${orgId} and user_id = ${userId}
  `;
  return rows.length ? toMembership(rows[0]) : null;
}

export async function listMemberships(scope: OrgScope): Promise<Membership[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<MembershipRow[]>`
    select id, org_id, user_id, role, created_at
      from memberships
     where org_id = ${orgId}
     order by created_at asc
  `;
  return rows.map(toMembership);
}
