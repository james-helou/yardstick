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

export async function findOrgById(id: string): Promise<Org | null> {
  const rows = await db()<OrgRow[]>`
    select id, name, slug, created_at from orgs where id = ${id}
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

/**
 * Every workspace a user belongs to, oldest first. Lives here because `memberships` has
 * exactly one owning module, and this is a read across orgs rather than within one.
 */
export async function listOrgsForUser(userId: string): Promise<Org[]> {
  const rows = await db()<OrgRow[]>`
    select o.id, o.name, o.slug, o.created_at
      from orgs o
      join memberships m on m.org_id = o.id
     where m.user_id = ${userId}
     order by m.created_at asc
  `;
  return rows.map(toOrg);
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

/**
 * Where a workspace's own notifications go: the people who run it, owners first.
 *
 * Reads better-auth's user table, which carries no org_id of its own. The membership
 * row is what scopes it, and the join is filtered by the same org_id in the same
 * statement, so a workspace can only ever learn its own members' addresses.
 */
export async function listOrgNotificationEmails(scope: OrgScope): Promise<string[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ email: string }[]>`
    select u."email" as email
      from memberships m
      join "user" u on u."id" = m.user_id
     where m.org_id = ${orgId}
       and m.role in ('owner', 'admin')
     order by case m.role when 'owner' then 0 else 1 end, m.created_at asc
  `;
  return rows.map((r) => r.email).filter(Boolean);
}

export type Member = { userId: string; email: string; name: string | null; role: Role };

/**
 * Who is in this workspace, with the name a person would recognise. Same shape of join as
 * the notification addresses above: the membership row is what scopes it, and the filter
 * is on the same org_id in the same statement.
 */
export async function listMembers(scope: OrgScope): Promise<Member[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ user_id: string; email: string; name: string | null; role: Role }[]>`
    select m.user_id, u."email" as email, u."name" as name, m.role
      from memberships m
      join "user" u on u."id" = m.user_id
     where m.org_id = ${orgId}
     order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, u."email" asc
  `;
  return rows.map((r) => ({ userId: r.user_id, email: r.email, name: r.name, role: r.role }));
}
