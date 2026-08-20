import { beforeEach, describe, expect, it } from "vitest";
import { addMembership, createOrg } from "@/lib/db/repos/orgs";
import { resetTables } from "@/test/db";
import { ForbiddenError, UnauthorizedError, requireOrgAccess, requireSessionFrom } from "./guards";
import { auth } from "./server";

const credentials = {
  email: "rep@agency.test",
  password: "a-sufficiently-long-password",
  name: "Rep",
};

/** Signs in for real and returns headers carrying the session cookie. */
async function signedInHeaders(): Promise<{ headers: Headers; userId: string }> {
  const { user } = await auth().api.signUpEmail({ body: credentials });
  const response = await auth().api.signInEmail({
    body: { email: credentials.email, password: credentials.password },
    asResponse: true,
  });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-in returned no cookie");
  const cookie = setCookie
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0].trim())
    .join("; ");
  return { headers: new Headers({ cookie }), userId: user.id };
}

beforeEach(() => resetTables());

describe("requireSessionFrom", () => {
  it("rejects a request with no session", async () => {
    await expect(requireSessionFrom(new Headers())).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects a forged cookie", async () => {
    const headers = new Headers({ cookie: "better-auth.session_token=not-a-real-token" });
    await expect(requireSessionFrom(headers)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("resolves a real signed-in user", async () => {
    const { headers } = await signedInHeaders();
    await expect(requireSessionFrom(headers)).resolves.toMatchObject({
      email: credentials.email,
    });
  });
});

describe("requireOrgAccess", () => {
  it("refuses a signed-in user who is not a member", async () => {
    const { headers } = await signedInHeaders();
    const org = await createOrg({ name: "Agency", slug: "agency" });
    await expect(requireOrgAccess(headers, { orgId: org.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("refuses a member whose role is not allowed", async () => {
    const { headers, userId } = await signedInHeaders();
    const org = await createOrg({ name: "Agency", slug: "agency" });
    await addMembership({ orgId: org.id }, { userId, role: "member" });
    await expect(
      requireOrgAccess(headers, { orgId: org.id }, ["owner", "admin"]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("admits a member with an allowed role", async () => {
    const { headers, userId } = await signedInHeaders();
    const org = await createOrg({ name: "Agency", slug: "agency" });
    await addMembership({ orgId: org.id }, { userId, role: "admin" });
    const { membership } = await requireOrgAccess(headers, { orgId: org.id }, ["owner", "admin"]);
    expect(membership.role).toBe("admin");
  });

  it("never leaks another org's membership", async () => {
    const { headers, userId } = await signedInHeaders();
    const mine = await createOrg({ name: "Mine", slug: "mine" });
    const theirs = await createOrg({ name: "Theirs", slug: "theirs" });
    await addMembership({ orgId: mine.id }, { userId, role: "owner" });
    await expect(requireOrgAccess(headers, { orgId: theirs.id })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("requires a valid org scope", async () => {
    const { headers } = await signedInHeaders();
    await expect(requireOrgAccess(headers, { orgId: "" })).rejects.toThrow(/org/i);
  });
});
