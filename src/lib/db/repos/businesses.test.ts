import { beforeEach, describe, expect, it } from "vitest";
import { parseListQuery, type ListQuery } from "@/lib/list/query";
import { resetTables } from "@/test/db";
import {
  countBusinessesByStatus,
  createBusiness,
  getBusiness,
  listBusinesses,
  updateBusiness,
  type BusinessSort,
} from "./businesses";
import { createOrg } from "./orgs";

const query = (params: Record<string, string> = {}): ListQuery<BusinessSort> =>
  parseListQuery(params, { sortable: ["name", "status", "createdAt"], defaultSort: "createdAt" });

async function twoOrgs() {
  const a = await createOrg({ name: "Agency A", slug: "agency-a" });
  const b = await createOrg({ name: "Agency B", slug: "agency-b" });
  return { a: { orgId: a.id }, b: { orgId: b.id } };
}

beforeEach(() => resetTables());

describe("businesses repository", () => {
  it("round-trips a business and coerces driver types", async () => {
    const { a } = await twoOrgs();
    const created = await createBusiness(a, {
      name: "Bright Smile Dental",
      status: "prospect",
      locality: "Montreal",
      country: "CA",
      latitude: 45.5017,
      longitude: -73.5673,
      websiteUrl: "https://brightsmile.ca",
    });

    expect(created.orgId).toBe(a.orgId);
    expect(created.createdAt).toBeInstanceOf(Date);
    // NUMERIC arrives as a string from the driver and must not leave the repository as one.
    expect(created.latitude).toBe(45.5017);
    expect(created.longitude).toBe(-73.5673);
  });

  it("leaves an absent optional field null rather than empty", async () => {
    const { a } = await twoOrgs();
    const created = await createBusiness(a, { name: "Acme", status: "prospect" });
    expect(created.locality).toBeNull();
    expect(created.latitude).toBeNull();
  });

  it("never returns another workspace's business", async () => {
    const { a, b } = await twoOrgs();
    const mine = await createBusiness(a, { name: "Mine", status: "prospect" });
    expect(await getBusiness(b, mine.id)).toBeNull();
    expect(await getBusiness(a, mine.id)).toMatchObject({ id: mine.id });
  });

  it("lists only the scoped workspace, newest first", async () => {
    const { a, b } = await twoOrgs();
    await createBusiness(a, { name: "First", status: "prospect" });
    await createBusiness(a, { name: "Second", status: "prospect" });
    await createBusiness(b, { name: "Theirs", status: "prospect" });

    const page = await listBusinesses(a, query());
    expect(page.window.total).toBe(2);
    expect(page.rows.map((r) => r.name)).toEqual(["Second", "First"]);
  });

  it("searches name, locality and website together", async () => {
    const { a } = await twoOrgs();
    await createBusiness(a, { name: "Bright Smile", status: "prospect", locality: "Laval" });
    await createBusiness(a, { name: "Acme", status: "prospect", websiteUrl: "https://smile.ca" });
    await createBusiness(a, { name: "Unrelated", status: "prospect" });

    expect((await listBusinesses(a, query({ q: "smile" }))).window.total).toBe(2);
    expect((await listBusinesses(a, query({ q: "laval" }))).window.total).toBe(1);
  });

  it("treats a wildcard in the search box as text, not a pattern", async () => {
    const { a } = await twoOrgs();
    await createBusiness(a, { name: "Fifty Percent", status: "prospect" });
    await createBusiness(a, { name: "50% Off Dental", status: "prospect" });

    const page = await listBusinesses(a, query({ q: "50%" }));
    expect(page.rows.map((r) => r.name)).toEqual(["50% Off Dental"]);
  });

  it("sorts by a whitelisted column in the requested direction", async () => {
    const { a } = await twoOrgs();
    await createBusiness(a, { name: "Zeta", status: "prospect" });
    await createBusiness(a, { name: "alpha", status: "prospect" });

    const asc = await listBusinesses(a, query({ sort: "name", dir: "asc" }));
    expect(asc.rows.map((r) => r.name)).toEqual(["alpha", "Zeta"]);
  });

  it("paginates at twenty a page", async () => {
    const { a } = await twoOrgs();
    for (let i = 0; i < 21; i += 1) {
      await createBusiness(a, { name: `Business ${i}`, status: "prospect" });
    }
    const first = await listBusinesses(a, query());
    expect(first.rows).toHaveLength(20);
    expect(first.window.hasNext).toBe(true);

    const second = await listBusinesses(a, query({ page: "2" }));
    expect(second.rows).toHaveLength(1);
  });

  it("updates only within the scope", async () => {
    const { a, b } = await twoOrgs();
    const mine = await createBusiness(a, { name: "Mine", status: "prospect" });

    expect(await updateBusiness(b, mine.id, { name: "Stolen", status: "client" })).toBeNull();
    const updated = await updateBusiness(a, mine.id, { name: "Mine", status: "client" });
    expect(updated?.status).toBe("client");
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(mine.updatedAt.getTime());
  });

  it("counts by status, reporting zero for statuses with no rows", async () => {
    const { a } = await twoOrgs();
    await createBusiness(a, { name: "One", status: "prospect" });
    await createBusiness(a, { name: "Two", status: "client" });

    expect(await countBusinessesByStatus(a)).toEqual({ prospect: 1, client: 1, archived: 0 });
  });

  it("refuses to add the same listing to one workspace twice", async () => {
    const { a, b } = await twoOrgs();
    await createBusiness(a, { name: "Acme", status: "prospect", placeId: "place-1" });

    await expect(
      createBusiness(a, { name: "Acme again", status: "prospect", placeId: "place-1" }),
    ).rejects.toThrow();

    // A different workspace selling to the same business is not a conflict.
    await expect(
      createBusiness(b, { name: "Acme", status: "prospect", placeId: "place-1" }),
    ).resolves.toMatchObject({ placeId: "place-1" });
  });
});
