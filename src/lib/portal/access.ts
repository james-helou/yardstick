import { requireSessionFrom, type SessionUser } from "@/lib/auth/guards";
import { findGrantForUser, listGrantsForUser, type PortalGrant } from "@/lib/db/repos/portal";
import type { OrgScope } from "@/lib/db/scope";

/**
 * The portal's own guard. A client is signed in but belongs to no workspace, so nothing
 * here goes near `resolveWorkspace`: authorization is the grant, and the org the grant
 * names is what scopes every read that follows.
 *
 * Deliberately narrow. A grant opens exactly one business, and there is no path from it
 * to a proposal, a price, a lead or another client.
 */

export class NoAccessError extends Error {
  constructor() {
    super("This is not shared with you");
    this.name = "NoAccessError";
  }
}

export type PortalSession = { user: SessionUser; grants: PortalGrant[] };

export async function resolvePortal(headers: Headers): Promise<PortalSession> {
  const user = await requireSessionFrom(headers);
  return { user, grants: await listGrantsForUser(user.id) };
}

export type PortalView = { user: SessionUser; grant: PortalGrant; scope: OrgScope };

/** One business, or nothing. A business nobody shared is a 404, not a refusal. */
export async function resolvePortalBusiness(headers: Headers, businessId: string): Promise<PortalView> {
  const user = await requireSessionFrom(headers);
  const grant = await findGrantForUser(user.id, businessId);
  if (!grant) throw new NoAccessError();

  return { user, grant, scope: { orgId: grant.orgId } };
}
