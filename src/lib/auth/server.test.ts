import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { createOrg } from "@/lib/db/repos/orgs";
import { resetTables } from "@/test/db";
import { auth, isGoogleSignInEnabled } from "./server";

const credentials = {
  email: "rep@agency.test",
  password: "a-sufficiently-long-password",
  name: "Rep",
};

beforeEach(() => resetTables());

describe("auth", () => {
  it("signs a user up against the vendored schema", async () => {
    const result = await auth().api.signUpEmail({ body: credentials });
    expect(result.user.email).toBe(credentials.email);
    expect(result.user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("signs an existing user in", async () => {
    await auth().api.signUpEmail({ body: credentials });
    const result = await auth().api.signInEmail({
      body: { email: credentials.email, password: credentials.password },
    });
    expect(result.user.email).toBe(credentials.email);
  });

  it("rejects a wrong password", async () => {
    await auth().api.signUpEmail({ body: credentials });
    await expect(
      auth().api.signInEmail({ body: { email: credentials.email, password: "wrong-password" } }),
    ).rejects.toThrow();
  });

  it("writes a session row the app can read", async () => {
    await auth().api.signUpEmail({ body: credentials });
    const rows = await db()<{ n: number }[]>`select count(*)::int as n from session`;
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("lets a membership reference the identity it was created for", async () => {
    const { user } = await auth().api.signUpEmail({ body: credentials });
    const org = await createOrg({ name: "Agency", slug: "agency" });
    const { addMembership, listMemberships } = await import("@/lib/db/repos/orgs");
    await addMembership({ orgId: org.id }, { userId: user.id, role: "owner" });
    expect(await listMemberships({ orgId: org.id })).toHaveLength(1);
  });

  it("refuses a membership for an identity that does not exist", async () => {
    const org = await createOrg({ name: "Agency", slug: "agency" });
    const { addMembership } = await import("@/lib/db/repos/orgs");
    await expect(
      addMembership(
        { orgId: org.id },
        { userId: "00000000-0000-0000-0000-000000000000", role: "owner" },
      ),
    ).rejects.toThrow();
  });

  it("keeps google sign-in dormant without credentials", () => {
    expect(isGoogleSignInEnabled()).toBe(false);
  });
});
