import { beforeEach, describe, expect, it } from "vitest";
import { createBusiness } from "@/lib/db/repos/businesses";
import { createOrg } from "@/lib/db/repos/orgs";
import {
  acceptGrant,
  findGrantByToken,
  findGrantForUser,
  inviteToPortal,
  isLiveGrant,
  listGrantsForBusiness,
  listGrantsForUser,
  newPortalToken,
  revokeGrant,
} from "@/lib/db/repos/portal";
import { createTestUser, resetTables } from "@/test/db";

async function agencyWithClient(slug: string, businessName = "Rivera Plumbing") {
  const org = await createOrg({ name: slug, slug });
  const scope = { orgId: org.id };
  const business = await createBusiness(scope, { name: businessName, status: "client" });
  return { scope, businessId: business.id };
}

beforeEach(() => resetTables());

describe("inviting a client", () => {
  it("mints a token nobody guesses", () => {
    const tokens = new Set(Array.from({ length: 200 }, () => newPortalToken()));
    expect(tokens.size).toBe(200);
    for (const token of tokens) expect(token.length).toBeGreaterThanOrEqual(32);
  });

  it("invites an address to exactly one business", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");

    const grant = await inviteToPortal(scope, { businessId, email: "  Owner@Rivera.example " });
    expect(grant).toMatchObject({ email: "owner@rivera.example", userId: null, acceptedAt: null });
    // An address alone is not access. Nothing is open until somebody signs in and opens it.
    expect(isLiveGrant(grant!)).toBe(false);
  });

  it("does not mint a second link for the same person", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const first = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    const second = await inviteToPortal(scope, { businessId, email: "OWNER@rivera.example" });

    expect(second!.token).toBe(first!.token);
    expect(await listGrantsForBusiness(scope, businessId)).toHaveLength(1);
  });

  it("refuses to invite anyone into another workspace's business", async () => {
    const a = await agencyWithClient("agency-a");
    const b = await agencyWithClient("agency-b", "Delacroix Dental");

    expect(await inviteToPortal(b.scope, { businessId: a.businessId, email: "sneak@example.com" })).toBeNull();
    expect(await listGrantsForBusiness(b.scope, a.businessId)).toEqual([]);
  });
});

describe("accepting an invitation", () => {
  it("binds it to whoever opened it, and that binding is what access is checked against", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const grant = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    const client = await createTestUser("owner@rivera.example");

    const bound = await acceptGrant(grant!.token, client);
    expect(bound!.userId).toBe(client);
    expect(bound!.acceptedAt).not.toBeNull();
    expect(isLiveGrant(bound!)).toBe(true);

    expect((await listGrantsForUser(client)).map((g) => g.businessId)).toEqual([businessId]);
    expect((await findGrantForUser(client, businessId))!.businessName).toBe("Rivera Plumbing");
  });

  it("cannot be claimed by a second person who was forwarded the link", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const grant = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    const client = await createTestUser("owner@rivera.example");
    const stranger = await createTestUser("stranger@example.com");

    await acceptGrant(grant!.token, client);
    expect(await acceptGrant(grant!.token, stranger)).toBeNull();

    // The first binding stands, and the stranger has nothing.
    expect((await findGrantByToken(grant!.token))!.userId).toBe(client);
    expect(await listGrantsForUser(stranger)).toEqual([]);
    expect(await findGrantForUser(stranger, businessId)).toBeNull();
  });

  it("accepting twice is the same accepting once", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const grant = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    const client = await createTestUser("owner@rivera.example");

    const first = await acceptGrant(grant!.token, client);
    const again = await acceptGrant(grant!.token, client);
    expect(again!.acceptedAt).toEqual(first!.acceptedAt);
  });

  it("does not look up a token too short to be one of ours", async () => {
    expect(await findGrantByToken("short")).toBeNull();
  });
});

describe("revoking", () => {
  it("closes the door on a client who has already opened it", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const grant = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    const client = await createTestUser("owner@rivera.example");
    await acceptGrant(grant!.token, client);

    expect(await revokeGrant(scope, grant!.id)).toBe(true);
    expect(await listGrantsForUser(client)).toEqual([]);
    expect(await findGrantForUser(client, businessId)).toBeNull();
    // And the link itself no longer accepts.
    expect(await acceptGrant(grant!.token, client)).toBeNull();
  });

  it("revoking twice is not an error, and another workspace cannot revoke at all", async () => {
    const a = await agencyWithClient("agency-a");
    const b = await agencyWithClient("agency-b", "Delacroix Dental");
    const grant = await inviteToPortal(a.scope, { businessId: a.businessId, email: "owner@rivera.example" });

    expect(await revokeGrant(b.scope, grant!.id)).toBe(false);
    expect(await revokeGrant(a.scope, grant!.id)).toBe(true);
    expect(await revokeGrant(a.scope, grant!.id)).toBe(false);
  });

  it("re-inviting a revoked client opens the same link again", async () => {
    const { scope, businessId } = await agencyWithClient("agency-a");
    const grant = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    await revokeGrant(scope, grant!.id);

    const again = await inviteToPortal(scope, { businessId, email: "owner@rivera.example" });
    expect(again!.token).toBe(grant!.token);
    expect(again!.revokedAt).toBeNull();
  });
});

describe("what a grant does not open", () => {
  it("opens one business, not the workspace it belongs to", async () => {
    const org = await createOrg({ name: "agency-a", slug: "agency-a" });
    const scope = { orgId: org.id };
    const shared = await createBusiness(scope, { name: "Rivera Plumbing", status: "client" });
    const other = await createBusiness(scope, { name: "Delacroix Dental", status: "client" });

    const grant = await inviteToPortal(scope, { businessId: shared.id, email: "owner@rivera.example" });
    const client = await createTestUser("owner@rivera.example");
    await acceptGrant(grant!.token, client);

    expect((await listGrantsForUser(client)).map((g) => g.businessId)).toEqual([shared.id]);
    // The other client of the same agency is not reachable from this grant.
    expect(await findGrantForUser(client, other.id)).toBeNull();
  });
});
