import { beforeEach, describe, expect, it } from "vitest";
import { money } from "@/lib/money";
import { resetTables } from "@/test/db";
import {
  archiveServiceItem,
  createServiceItem,
  getServiceItem,
  listServiceItems,
  updateServiceItem,
} from "./catalog";
import { createOrg } from "./orgs";

async function agency(slug: string) {
  const org = await createOrg({ name: slug, slug });
  return { orgId: org.id };
}

const retainer = {
  name: "Local SEO retainer",
  billing: "monthly" as const,
  unitPrice: money(120_000, "CAD"),
};

beforeEach(() => resetTables());

describe("the service catalogue", () => {
  it("keeps a price as integer minor units through a round trip", async () => {
    const scope = await agency("agency-a");
    const item = await createServiceItem(scope, { ...retainer, description: "Everything monthly" });

    expect(item.unitPrice).toEqual(money(120_000, "CAD"));
    expect((await getServiceItem(scope, item.id))?.unitPrice).toEqual(money(120_000, "CAD"));
  });

  it("lists what is on sale, in the order the agency arranged it", async () => {
    const scope = await agency("agency-a");
    await createServiceItem(scope, { ...retainer, name: "Second", sortOrder: 2 });
    await createServiceItem(scope, { ...retainer, name: "First", sortOrder: 1 });

    expect((await listServiceItems(scope)).map((i) => i.name)).toEqual(["First", "Second"]);
  });

  it("hides an archived item from the list without losing it", async () => {
    const scope = await agency("agency-a");
    const item = await createServiceItem(scope, retainer);

    expect(await archiveServiceItem(scope, item.id)).toBe(true);
    expect(await listServiceItems(scope)).toEqual([]);
    // Still there, because proposals that used it have to stay readable.
    expect((await listServiceItems(scope, { includeInactive: true })).map((i) => i.id)).toEqual([item.id]);
    expect((await getServiceItem(scope, item.id))?.active).toBe(false);
  });

  it("changes a price without touching anything already quoted", async () => {
    const scope = await agency("agency-a");
    const item = await createServiceItem(scope, retainer);

    const updated = await updateServiceItem(scope, item.id, { unitPrice: money(150_000, "CAD") });
    expect(updated?.unitPrice).toEqual(money(150_000, "CAD"));
    expect(updated?.name).toBe("Local SEO retainer");
  });

  it("clears a description when asked, rather than reading null as no change", async () => {
    const scope = await agency("agency-a");
    const item = await createServiceItem(scope, { ...retainer, description: "Everything monthly" });

    expect((await updateServiceItem(scope, item.id, { description: null }))?.description).toBeNull();
    // An omitted field is left alone.
    expect((await updateServiceItem(scope, item.id, { name: "Renamed" }))?.description).toBeNull();
  });

  it("never lets one workspace read or change another's prices", async () => {
    const a = await agency("agency-a");
    const b = await agency("agency-b");
    const item = await createServiceItem(a, retainer);

    expect(await getServiceItem(b, item.id)).toBeNull();
    expect(await updateServiceItem(b, item.id, { unitPrice: money(1, "CAD") })).toBeNull();
    expect(await archiveServiceItem(b, item.id)).toBe(false);
    expect((await getServiceItem(a, item.id))?.unitPrice).toEqual(money(120_000, "CAD"));
  });
});
