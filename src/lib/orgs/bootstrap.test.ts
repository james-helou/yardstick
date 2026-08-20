import { beforeEach, describe, expect, it } from "vitest";
import { creditBalance } from "@/lib/db/repos/credits";
import { listMemberships } from "@/lib/db/repos/orgs";
import { createTestUser, resetTables } from "@/test/db";
import { ensureWorkspaceForUser, WELCOME_CREDITS } from "./bootstrap";

beforeEach(() => resetTables());

describe("ensureWorkspaceForUser", () => {
  it("creates a workspace the new user owns", async () => {
    const userId = await createTestUser("owner@agency.test");
    const org = await ensureWorkspaceForUser(userId, "Bright Media");

    expect(org.name).toBe("Bright Media");
    expect(org.slug).toBe("bright-media");

    const members = await listMemberships({ orgId: org.id });
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ userId, role: "owner" });
  });

  it("is idempotent, so a retried sign-up does not make a second workspace", async () => {
    const userId = await createTestUser("owner@agency.test");
    const first = await ensureWorkspaceForUser(userId, "Bright Media");
    const second = await ensureWorkspaceForUser(userId, "Something Else");

    expect(second.id).toBe(first.id);
    expect(second.name).toBe("Bright Media");
  });

  it("gives a second agency of the same name its own slug", async () => {
    const one = await createTestUser("one@agency.test");
    const two = await createTestUser("two@agency.test");

    const a = await ensureWorkspaceForUser(one, "Bright Media");
    const b = await ensureWorkspaceForUser(two, "Bright Media");

    expect(b.slug).not.toBe(a.slug);
    expect(b.slug.startsWith("bright-media")).toBe(true);
  });

  it("falls back to a named workspace when the agency name is blank", async () => {
    const userId = await createTestUser("owner@agency.test");
    const org = await ensureWorkspaceForUser(userId, "   ");
    expect(org.name).toBe("My workspace");
    expect(org.slug).toBe("my-workspace");
  });
});

describe("welcome credits", () => {
  it("gives a new workspace enough credits to see the product work", async () => {
    const userId = await createTestUser("credits@agency.test");
    const org = await ensureWorkspaceForUser(userId, "Credit Agency");
    expect(await creditBalance({ orgId: org.id })).toBe(WELCOME_CREDITS);
  });

  it("does not grant twice when sign-up is submitted twice", async () => {
    const userId = await createTestUser("twice@agency.test");
    const first = await ensureWorkspaceForUser(userId, "Twice Agency");
    await ensureWorkspaceForUser(userId, "Twice Agency");
    expect(await creditBalance({ orgId: first.id })).toBe(WELCOME_CREDITS);
  });
});
