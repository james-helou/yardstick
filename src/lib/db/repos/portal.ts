import { randomBytes } from "node:crypto";
import { db } from "../client";
import { isUuid } from "../uuid";
import { requireOrg, type OrgScope } from "../scope";

/**
 * Client access to one business.
 *
 * Two functions here take no org scope, and both are the same shape as the public link
 * lookups elsewhere in the product: `findGrantByToken` because an invitation arrives
 * before anyone is signed in, and `listGrantsForUser` because a client belongs to no
 * workspace at all. Each returns the org it names, and that org scopes everything after.
 *
 * Knowing the address is never enough. A grant only opens once somebody signed in has
 * opened the token, and it is that binding, not the email, that access is checked
 * against afterwards.
 */

export type PortalGrant = {
  id: string;
  orgId: string;
  businessId: string;
  businessName: string | null;
  email: string;
  token: string;
  userId: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type Row = {
  id: string;
  org_id: string;
  business_id: string;
  business_name?: string | null;
  email: string;
  token: string;
  user_id: string | null;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
};

const toGrant = (r: Row): PortalGrant => ({
  id: r.id,
  orgId: r.org_id,
  businessId: r.business_id,
  businessName: r.business_name ?? null,
  email: r.email,
  token: r.token,
  userId: r.user_id,
  acceptedAt: r.accepted_at === null ? null : new Date(r.accepted_at),
  revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at),
  createdAt: new Date(r.created_at),
});

/** 24 bytes, url-safe. The same shape as every other token the product hands out. */
export function newPortalToken(): string {
  return randomBytes(24).toString("base64url");
}

export const isLiveGrant = (grant: PortalGrant): boolean =>
  grant.revokedAt === null && grant.userId !== null;

/**
 * Invites one address to one business, or revives the invitation it already has. Never
 * mints a second token for the same pair: an agency that presses invite twice should not
 * leave one live link and one dead one.
 */
export async function inviteToPortal(
  scope: OrgScope,
  input: { businessId: string; email: string; invitedBy?: string | null },
): Promise<PortalGrant | null> {
  const orgId = requireOrg(scope);
  const email = input.email.trim().toLowerCase();

  // Selecting from businesses is the tenancy check: another workspace's business produces
  // no row at all rather than an invitation into somebody else's client.
  const [row] = await db()<Row[]>`
    insert into portal_grants (org_id, business_id, email, token, invited_by)
    select ${orgId}, b.id, ${email}, ${newPortalToken()}, ${input.invitedBy ?? null}
      from businesses b where b.id = ${input.businessId} and b.org_id = ${orgId}
    on conflict (business_id, email) do update set revoked_at = null
    returning *
  `;
  return row ? toGrant(row) : null;
}

export async function listGrantsForBusiness(scope: OrgScope, businessId: string): Promise<PortalGrant[]> {
  const orgId = requireOrg(scope);
  const rows = await db()<Row[]>`
    select * from portal_grants
     where business_id = ${businessId} and org_id = ${orgId}
     order by created_at asc
  `;
  return rows.map(toGrant);
}

export async function revokeGrant(scope: OrgScope, grantId: string): Promise<boolean> {
  const orgId = requireOrg(scope);
  const rows = await db()<{ id: string }[]>`
    update portal_grants set revoked_at = now()
     where id = ${grantId} and org_id = ${orgId} and revoked_at is null
    returning id
  `;
  return rows.length > 0;
}

/** No scope: an invitation arrives before anyone is signed in. Short tokens are not ours. */
export async function findGrantByToken(token: string): Promise<PortalGrant | null> {
  if (token.length < 16) return null;
  const [row] = await db()<Row[]>`select * from portal_grants where token = ${token}`;
  return row ? toGrant(row) : null;
}

/**
 * Binds an invitation to the person who opened it. This is what turns an address into
 * access, and it only ever happens once: a second opening by somebody else leaves the
 * first binding alone and grants nothing.
 */
export async function acceptGrant(token: string, userId: string): Promise<PortalGrant | null> {
  const [row] = await db()<Row[]>`
    update portal_grants
       set user_id = coalesce(user_id, ${userId}), accepted_at = coalesce(accepted_at, now())
     where token = ${token} and revoked_at is null
    returning *
  `;
  if (!row) return null;
  const grant = toGrant(row);
  return grant.userId === userId ? grant : null;
}

/** No scope: a client belongs to no workspace. Each grant names the org it came from. */
export async function listGrantsForUser(userId: string): Promise<PortalGrant[]> {
  const rows = await db()<Row[]>`
    select g.*, b.name as business_name
      from portal_grants g
      join businesses b on b.id = g.business_id and b.org_id = g.org_id
     where g.user_id = ${userId} and g.revoked_at is null
     order by b.name asc
  `;
  return rows.map(toGrant);
}

/** The one grant this person has for this business, or nothing. The portal's whole guard. */
export async function findGrantForUser(userId: string, businessId: string): Promise<PortalGrant | null> {
  if (!isUuid(businessId)) return null;

  const [row] = await db()<Row[]>`
    select g.*, b.name as business_name
      from portal_grants g
      join businesses b on b.id = g.business_id and b.org_id = g.org_id
     where g.user_id = ${userId} and g.business_id = ${businessId} and g.revoked_at is null
  `;
  return row ? toGrant(row) : null;
}
