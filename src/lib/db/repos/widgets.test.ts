import { beforeEach, describe, expect, it } from "vitest";
import { resetTables } from "@/test/db";
import { createOrg } from "./orgs";
import {
  createWidgetKey,
  deactivateWidgetKey,
  findActiveWidgetKey,
  listWidgetKeys,
  newPublicKey,
} from "./widgets";

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

beforeEach(() => resetTables());

describe("widget keys", () => {
  it("mints a recognisable key that is not guessable", () => {
    const key = newPublicKey();
    expect(key).toMatch(/^yk_[A-Za-z0-9_-]{16,}$/);
    expect(newPublicKey()).not.toBe(key);
  });

  it("creates a live key the public lookup can find", async () => {
    const scope = await agency("agency-a");
    const key = await createWidgetKey(scope, { label: "Homepage" });

    expect(key).toMatchObject({ label: "Homepage", active: true, orgId: scope.orgId });
    expect(await findActiveWidgetKey(key.publicKey)).toMatchObject({ id: key.id, orgId: scope.orgId });
  });

  it("stops resolving the moment it is switched off", async () => {
    const scope = await agency("agency-a");
    const key = await createWidgetKey(scope);

    expect(await deactivateWidgetKey(scope, key.id)).toBe(true);
    expect(await findActiveWidgetKey(key.publicKey)).toBeNull();
    // Switching off twice is not an error, it is nothing to do.
    expect(await deactivateWidgetKey(scope, key.id)).toBe(false);
  });

  it("keeps a switched-off key in the list, so the agency can see what it turned off", async () => {
    const scope = await agency("agency-a");
    const key = await createWidgetKey(scope);
    await deactivateWidgetKey(scope, key.id);

    const keys = await listWidgetKeys(scope);
    expect(keys).toHaveLength(1);
    expect(keys[0].active).toBe(false);
  });

  it("refuses anything that is not shaped like one of our keys, without a query", async () => {
    expect(await findActiveWidgetKey("not-ours")).toBeNull();
    expect(await findActiveWidgetKey("")).toBeNull();
  });

  it("never lets one workspace switch off another's key", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const key = await createWidgetKey(a);

    expect(await deactivateWidgetKey(b, key.id)).toBe(false);
    expect(await findActiveWidgetKey(key.publicKey)).not.toBeNull();
    expect(await listWidgetKeys(b)).toEqual([]);
  });
});
