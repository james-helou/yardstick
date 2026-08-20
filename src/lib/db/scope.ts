/** Every tenant query carries one of these. There is no ambient "current org". */
export type OrgScope = Readonly<{ orgId: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireOrg(scope: OrgScope): string {
  if (!scope?.orgId || !UUID.test(scope.orgId)) {
    throw new Error("A valid org id is required for every tenant query");
  }
  return scope.orgId;
}
