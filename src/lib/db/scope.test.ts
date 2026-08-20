import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, resetTables } from "@/test/db";
import { addMembership, createOrg, findOrgBySlug, listMemberships } from "./repos/orgs";
import { requireOrg } from "./scope";

beforeEach(() => resetTables());

describe("requireOrg", () => {
  it("rejects an empty org id", () => {
    expect(() => requireOrg({ orgId: "" })).toThrow(/org/i);
  });

  it("rejects a non-uuid org id", () => {
    expect(() => requireOrg({ orgId: "1 or 1=1" })).toThrow(/org/i);
  });

  it("returns a valid org id", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    expect(requireOrg({ orgId: id })).toBe(id);
  });
});

describe("org repository", () => {
  it("round-trips an org and coerces created_at to a Date", async () => {
    const org = await createOrg({ name: "Agency A", slug: "agency-a" });
    expect(org.createdAt).toBeInstanceOf(Date);
    expect(await findOrgBySlug("agency-a")).toMatchObject({ id: org.id, name: "Agency A" });
  });

  it("returns null for an unknown slug", async () => {
    expect(await findOrgBySlug("nope")).toBeNull();
  });

  it("never returns rows belonging to another org", async () => {
    const a = await createOrg({ name: "Agency A", slug: "agency-a" });
    const b = await createOrg({ name: "Agency B", slug: "agency-b" });
    await addMembership({ orgId: a.id }, { userId: await createTestUser("a@x.test"), role: "owner" });
    await addMembership({ orgId: b.id }, { userId: await createTestUser("b@x.test"), role: "owner" });

    const fromB = await listMemberships({ orgId: b.id });
    expect(fromB).toHaveLength(1);
    expect(fromB.every((m) => m.orgId === b.id)).toBe(true);
  });

  it("refuses to read memberships without a scope", async () => {
    await expect(listMemberships({ orgId: "" })).rejects.toThrow(/org/i);
  });
});
