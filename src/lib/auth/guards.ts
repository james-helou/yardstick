import { findMembership, type Membership, type Role } from "@/lib/db/repos/orgs";
import type { OrgScope } from "@/lib/db/scope";
import { auth } from "./server";

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to continue");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this workspace") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type SessionUser = { id: string; email: string; name: string };

/**
 * Resolves the signed-in user from request headers.
 *
 * Takes headers explicitly rather than reaching for `next/headers`, so the same
 * function is callable from a server action, a route handler, or a test.
 */
export async function requireSessionFrom(headers: Headers): Promise<SessionUser> {
  const session = await auth().api.getSession({ headers });
  if (!session?.user) throw new UnauthorizedError();
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}

/**
 * Authorises a user against one org.
 *
 * A Next.js layout does NOT protect the server actions rendered beneath it — an action
 * is its own entry point and is reachable without ever rendering that layout. So every
 * action calls this itself. There is no ambient "current org" to fall back on.
 */
export async function requireOrgRoleFor(
  userId: string,
  scope: OrgScope,
  allowed: readonly Role[],
): Promise<Membership> {
  const membership = await findMembership(scope, userId);
  if (!membership) throw new ForbiddenError();
  if (!allowed.includes(membership.role)) {
    throw new ForbiddenError(`This action requires one of: ${allowed.join(", ")}`);
  }
  return membership;
}

/** The pair, for the common case: who are you, and may you act on this org? */
export async function requireOrgAccess(
  headers: Headers,
  scope: OrgScope,
  allowed: readonly Role[] = ["owner", "admin", "member"],
): Promise<{ user: SessionUser; membership: Membership }> {
  const user = await requireSessionFrom(headers);
  const membership = await requireOrgRoleFor(user.id, scope, allowed);
  return { user, membership };
}
