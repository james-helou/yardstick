import { listOrgsForUser, type Org } from "@/lib/db/repos/orgs";
import type { OrgScope } from "@/lib/db/scope";
import { requireOrgRoleFor, requireSessionFrom, type SessionUser } from "./guards";
import type { Membership } from "@/lib/db/repos/orgs";

export class NoWorkspaceError extends Error {
  constructor() {
    super("You are signed in but do not have a workspace yet");
    this.name = "NoWorkspaceError";
  }
}

export type Workspace = {
  user: SessionUser;
  org: Org;
  scope: OrgScope;
  membership: Membership;
};

/**
 * Who is asking, and which workspace are they acting in.
 *
 * Deliberately does not create a workspace on a read. A missing workspace is a distinct
 * outcome the caller routes to onboarding, rather than a side effect hidden inside a GET
 * where a bug in sign-up would look like normal behaviour.
 *
 * Takes headers explicitly so a page, a server action and a test all use one path. This
 * being called in a layout does not protect the actions beneath it; every action calls it
 * itself.
 */
export async function resolveWorkspace(headers: Headers): Promise<Workspace> {
  const user = await requireSessionFrom(headers);
  const orgs = await listOrgsForUser(user.id);
  if (orgs.length === 0) throw new NoWorkspaceError();

  const org = orgs[0];
  const scope: OrgScope = { orgId: org.id };
  const membership = await requireOrgRoleFor(user.id, scope, ["owner", "admin", "member"]);
  return { user, org, scope, membership };
}
